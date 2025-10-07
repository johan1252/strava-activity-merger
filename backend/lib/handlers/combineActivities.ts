import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Logger } from '@aws-lambda-powertools/logger';
import strava from 'strava-v3';
import { buildGPX, StravaBuilder } from "gpx-builder";
import * as fs from 'fs';

const logger = new Logger({ serviceName: 'authorize' });

const debug = false;

const combineActivities = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info("Entered handler");
    try {
        if (!event?.headers?.Authorization) {
            throw new Error("No Authorization information provided");
        }
        const accessToken = event.headers.Authorization.split(' ')[1];

        if (!event.body) {
            throw new Error("Request body is null or undefined");
        }
        const body = JSON.parse(event.body);
        const { activities } = body
        if (!activities || !Array.isArray(activities)) {
            throw new Error("Activities are missing or not an array");
        }
        if (activities.length !== 2) {
            throw new Error("Activities must be an array of exactly two items");
        }
        if (!activities[0].id || !activities[1].id) {
            throw new Error("Activity IDs are missing");
        }
        if (!activities[0].startDate || !activities[1].startDate) {
            throw new Error("Activity start dates are missing");
        }
        if (!activities[0].name || !activities[1].name) {
            throw new Error("Activity names are missing");
        }
        if (activities[0].sport_type !== activities[1].sport_type) {
            throw new Error("Activities must be of the same type");
        }

        // Order the activities by start date (earliest first)
        activities.sort((a: any, b: any) => {
            return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        });

        await strava.client(accessToken);

        let gpxPoints = [];
        for (let i = 0; i < activities.length; i += 1) {

            const activityStreamData = await strava.streams.activity({
                id: activities[i].id,
                types: 'time,distance,latlng,altitude,altitude,heartrate,cadence,temp,watts',
                resolution: 'high'
            }
            );

            const { Point } = StravaBuilder.MODELS;

            let latLong: any[] = [];
            let ele: any[] = [];
            let time: any[] = [];
            let hr: any[] = [];
            let power: any[] = [];
            let distance: any[] = [];
            let cad: any[] = [];
            const origStartTime = new Date(activities[i].startDate);
            const startTime = new Date(origStartTime.getTime() + 90000); // Add 90 seconds to ensure Strava doesn't consider duplicate
            console.log("Set start time", startTime, "Original:", activities[i].startDate);


            // Assign all the above
            // to the latLong, ele, time, hr, power and distance arrays
            for (let j = 0; j < activityStreamData.length; j += 1) {
                const item = activityStreamData[j];
                if (item.type === 'latlng') {
                    latLong = item.data;
                } else if (item.type === 'altitude') {
                    ele = item.data;
                } else if (item.type === 'time') {
                    time = item.data;
                } else if (item.type === 'heartrate') {
                    hr = item.data;
                } else if (item.type === 'watts') {
                    power = item.data;
                } else if (item.type === 'distance') {
                    distance = item.data;
                } else if (item.type === 'cadence') {
                    cad = item.data;
                }
            }


            for (let j = 0; j < latLong.length; j += 1) {
                const lat = latLong[j][0];
                const long = latLong[j][1];
                const eleValue = ele[j];
                const timeValue = new Date(startTime.getTime() + (time[j] * 1000));
                const hrValue = hr[j];
                const powerValue = power[j];
                const distanceValue = distance[j];
                const cadValue = cad[j];

                // Create a new Point object
                const point = new Point(lat, long, {
                    ele: eleValue,
                    time: timeValue,
                    hr: hrValue,
                    power: powerValue,
                    distance: distanceValue,
                    cad: cadValue
                });

                // Push the Point object to the points array
                gpxPoints.push(point);

                //console.log(point);
            }
            console.log("Completed activity: ", activities[i].name, "Id: ", activities[i].id);
        }
        const gpxData = new StravaBuilder();

        gpxData.setSegmentPoints(gpxPoints);

        //console.log("GPX Data: ", gpxPoints);

        // Create a GPX file
        const gpx = buildGPX(gpxData.toObject());
        // Save the GPX file locally
        await fs.writeFileSync('/tmp/activity.gpx', gpx);
        // Upload the GPX file to Strava

        const firstResp = await strava.uploads.post({
            activity_type: activities[0].sport_type,
            sport_type: activities[0].sport_type,
            data_type: 'gpx',
            name: activities[0].name,
            description: `Activities combined by streventools.com`,
            // @ts-ignore
            file: '/tmp/activity.gpx',
            external_id: `streven-cb-${activities[0].id}-${activities[1].id}`, // Doesn't work because of https://github.com/node-strava/node-strava-v3/blob/ed05aa781461d99237d9ae67c67655b208299ecf/lib/uploads.js#L5

            //private: true, Not supported :(
        }, function () {
            console.log('First part of upload complete');
        }
        );

        const { id: uploadId } = firstResp;
        
        let response: any = {}
        // @ts-ignore
        await strava.uploads._check({
            id: uploadId
        }, function (err: any, res: any) {
            response = res;
            console.log(err, res);
        });
        let timeout = 0;
        while (!response?.activity_id && !response?.error && timeout < 120000) {
            console.log("Waiting for upload to complete...");
            timeout += 500;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (timeout >= 30000) {
            throw new Error("Timeout waiting for upload to complete");
        }

        console.log('Second part of upload complete');

        if (debug) {
            const combinedActivityId = response.activity_id;
            const updateRespone = await strava.activities.update({
                id: combinedActivityId,
                hide_from_home: true // Doesn't work right now because of https://github.com/node-strava/node-strava-v3/blob/main/lib/activities.js#L25
            });
            console.log(updateRespone);
            console.log('Activity updated to hide_from_home: true');
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                activityId: response.activity_id
            })
        };
    } catch (error) {
        logger.error({ message: "Error in handler", error });
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: "Internal Server Error",
                // @ts-ignore
                error: error.message,
            }),
        };
    }
};

const handler = combineActivities;

export { handler };