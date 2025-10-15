import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Logger } from '@aws-lambda-powertools/logger';
import strava from 'strava-v3';
import { buildGPX, StravaBuilder } from "gpx-builder";
import * as fs from 'fs';
import { saveToS3 } from "../utils/saveToS3";

const logger = new Logger({ serviceName: 'combineActivities' });

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
        const { activities, athlete } = body
        if (!athlete) {
            throw new Error("Athlete object missing");
        }
        const { id: athleteId, firstName: athleteFirstName } = athlete
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
        let firstActivityDistance = 0;
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
            const startTime = new Date(origStartTime.getTime() + 120000); // Add 120 seconds to ensure Strava doesn't consider duplicate
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
                let distanceValue = distance[j];
                if (i === 1) { // TODO: if combining more than two activities this will need to be adjusted
                    // For second activity, adjust distance to continue from first activity (distance is culumative)
                    distanceValue = distance[j] + firstActivityDistance;
                    // Round to 1 decimal place
                    distanceValue = Math.round(distanceValue * 10) / 10;
                }
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
            if (i === 0) { // If first activity, store the last distance value
                firstActivityDistance = distance[distance.length - 1];
            }
            console.log("Completed activity: ", activities[i].name, "Id: ", activities[i].id);
        }
        const gpxData = new StravaBuilder();

        gpxData.setSegmentPoints(gpxPoints);

        //console.log("GPX Data: ", gpxPoints);

        // Create a GPX file
        const gpx = buildGPX(gpxData.toObject());
        // Save the GPX file locally
        const fileName = `/tmp/activity.gpx`;
        await fs.writeFileSync(fileName, gpx);

        // Backup file to S3 bucket for debugging
        const dateNow = new Date();
        const s3Key = `${athleteFirstName}-${athleteId}/${dateNow.toISOString()}/combined-${activities[0].id}-${activities[1].id}.gpx`;
        await saveToS3(s3Key, fileName);

        let response: any = {}
        // Upload the GPX file to Strava
        const firstResp = await strava.uploads.post({
            activity_type: activities[0].sport_type,
            sport_type: activities[0].sport_type,
            data_type: 'gpx',
            name: activities[0].name,
            description: `Activities combined by streventools.com`,
            // @ts-ignore
            file: '/tmp/activity.gpx',
            external_id: `streven-cb-${activities[0].id}-${activities[1].id}`,

            //private: true, Not supported :(
        }, function () {
            console.log('First part of upload complete');
        }
        );

        const { id: uploadId } = firstResp;

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

        if (response?.error) {
            throw new Error(`Error uploading activity: ${response.error}`);
        }
        if (!response?.activity_id) {
            throw new Error("No activity_id returned from Strava");
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