import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Logger } from '@aws-lambda-powertools/logger';
import strava from 'strava-v3';
import { buildGPX, StravaBuilder } from "gpx-builder";
import * as fs from 'fs';

const logger = new Logger({ serviceName: 'authorize' });

const debug = false;

const roundUp = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
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
        const { activity } = body
        if (!activity) {
            throw new Error("Activity object missing");
        }
        if (!activity?.id) {
            throw new Error("Activity ID missing");
        }
        if (!activity.startDate) {
            throw new Error("Activity start date missing");
        }
        if (!activity.name) {
            throw new Error("Activity name missing");
        }
        if (!activity.distance) {
            throw new Error("Activity distance missing");
        }
        if (!activity.sport_type) {
            throw new Error("Activity sport_type missing");
        }

        await strava.client(accessToken);

        let gpxPoints = [];


        const activityStreamData = await strava.streams.activity({
            id: activity.id,
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
        const origStartTime = new Date(activity.startDate);
        const startTime = new Date(origStartTime.getTime() + 90000); // Add 90 seconds to ensure Strava doesn't consider duplicate
        console.log("Set start time", startTime, "Original:", activity.startDate);


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
        }

        // --- ROUND UP LOGIC ---
        const roundedDistance = Math.ceil(activity.distance / 1000) * 1000;
        const distanceToAdd = roundedDistance - activity.distance;
        if (distanceToAdd > 0 && distance.length > 1) {
            // Find the start index of the last 1km
            const lastKmStart = distance[distance.length - 1] - 1000;
            let lastKmStartIndex = 0;
            for (let i = distance.length - 1; i >= 0; i--) {
                if (distance[i] <= lastKmStart) {
                    lastKmStartIndex = i;
                    break;
                }
            }
            const lastTime = time[time.length - 1];
            const lastKmStartTime = time[lastKmStartIndex];
            const lastKmDuration = lastTime - lastKmStartTime;
            const avgSpeed = 1000 / lastKmDuration; // m/s

            // Use last known values for lat, long, ele, hr, power, cad
            const lastLat = latLong[latLong.length - 1][0];
            const lastLong = latLong[latLong.length - 1][1];
            const lastEle = ele[ele.length - 1];
            const lastHr = hr.length > 0 ? hr[hr.length - 1] : undefined;
            const lastPower = power.length > 0 ? power[power.length - 1] : undefined;
            const lastCad = cad.length > 0 ? cad[cad.length - 1] : undefined;
            let lastDistance = distance[distance.length - 1];
            let lastTimeAbs = time[time.length - 1];
            let pointsToAdd = Math.ceil(distanceToAdd / (lastDistance - distance[distance.length - 2]));
            if (!isFinite(pointsToAdd) || pointsToAdd < 1) pointsToAdd = Math.ceil(distanceToAdd / 10); // fallback: 10m steps
            const step = distanceToAdd / pointsToAdd;
            const timeStep = step / avgSpeed;
            for (let i = 1; i <= pointsToAdd; i++) {
                lastDistance += step;
                lastTimeAbs += timeStep;
                const point = new Point(lastLat, lastLong, {
                    ele: lastEle,
                    time: new Date(startTime.getTime() + (lastTimeAbs * 1000)),
                    hr: lastHr,
                    power: lastPower,
                    distance: lastDistance,
                    cad: lastCad // TODO - debug why lastCad is sometimes undefined/0
                });
                gpxPoints.push(point);
            }
        }

        console.log("Completed activity: ", activity.name, "Id: ", activity.id);
        
        const gpxData = new StravaBuilder();

        gpxData.setSegmentPoints(gpxPoints);

        //console.log("GPX Data: ", gpxPoints);

        // Create a GPX file
        const gpx = buildGPX(gpxData.toObject());
        // Save the GPX file locally
        await fs.writeFileSync('/tmp/activity.gpx', gpx);
        // Upload the GPX file to Strava

        const firstResp = await strava.uploads.post({
            activity_type: activity.sport_type,
            sport_type: activity.sport_type,
            data_type: 'gpx',
            name: activity.name,
            description: `Activity rounded up by streventools.com`,
            // @ts-ignore
            file: '/tmp/activity.gpx',
            external_id: `streven-ru-${activity.id}`,
        }, function () {
            console.log('First part of upload complete');
        }
        );

        const { id: uploadId } = firstResp;

        console.log("Upload ID:", uploadId);

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
            const newActivityId = response.activity_id;
            const updateRespone = await strava.activities.update({
                id: newActivityId,
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

const handler = roundUp;

export { handler };
