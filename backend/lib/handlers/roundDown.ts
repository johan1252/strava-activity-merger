import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Logger } from '@aws-lambda-powertools/logger';
import strava from 'strava-v3';
import { buildGPX, StravaBuilder } from "gpx-builder";
import * as fs from 'fs';
import { saveToS3 } from "../utils/saveToS3";

const logger = new Logger({ serviceName: 'roundDowns' });

const roundDown = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
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
        const { activity, athlete } = body
        if (!athlete) {
            throw new Error("Athlete object missing");
        }
        const { id: athleteId, firstName } = athlete
        const athleteFirstName = firstName.trim();
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
        if (!activity.targetDistance) {
            throw new Error("Activity targetDistance missing");
        }

        if (activity.distance < 1000) {
            throw new Error("Activity distance is less than 1km, cannot round down");
        }

        logger.appendKeys({ athleteId, athleteFirstName });

        await strava.client(accessToken);

        let gpxPoints = [];

        const activityStreamData = await strava.streams.activity({
            id: activity.id,
            types: 'time,distance,latlng,altitude,altitude,heartrate,cadence,temp,watts',
            resolution: 'high'
        });

        const { Point } = StravaBuilder.MODELS;

        let latLong: any[] = [];
        let ele: any[] = [];
        let time: any[] = [];
        let hr: any[] = [];
        let power: any[] = [];
        let distance: any[] = [];
        let cad: any[] = [];
        const origStartTime = new Date(activity.startDate);
        const startTime = new Date(origStartTime.getTime() + 120000); // Add 120 seconds to ensure Strava doesn't consider duplicate
        logger.info("Set start time", { startTime, originalStart: activity.startDate });

        // Assign all the above
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

        // Find the index where distance is just below or equal to the target distance
        const targetDistance = activity.targetDistance; // Target distance in meters
        const roundedDistance = targetDistance + 0.9; // add a small buffer to ensure we go over the rounded distance (Strava will round down to nearest 2nd decimal)
        let lastIndex = distance.length - 1;
        for (let i = 0; i < distance.length; i++) {
            if (distance[i] > roundedDistance) {
                lastIndex = i - 1;
                break;
            }
        }
        if (lastIndex < 0) lastIndex = 0;

        for (let j = 0; j <= lastIndex; j += 1) {
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
            gpxPoints.push(point);
        }

        // If we didn't reach the roundedDistance, add points using avg speed from last 1km
        // This can happen since GPX points are not always exactly 1m apart in distance
        let lastDistanceVal = distance[lastIndex];
        logger.info("lastDistanceVal", { lastDistanceVal, roundedDistance });
        if (lastDistanceVal < roundedDistance && distance.length > 1) {
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
            const lastLat = latLong[lastIndex][0];
            const lastLong = latLong[lastIndex][1];
            const lastEle = ele[lastIndex];
            const lastHr = hr.length > 0 ? hr[hr.length - 1] : undefined;
            const lastPower = power.length > 0 ? power[power.length - 1] : undefined;
            const lastCad = cad.length > 0 ? cad[cad.length - 1] : undefined;
            let lastTimeAbs = time[lastIndex];
            let toAdd = roundedDistance - lastDistanceVal;
            let pointsToAdd = Math.ceil(toAdd / ((distance[lastIndex] - distance[lastIndex - 1]) || 10));
            if (!isFinite(pointsToAdd) || pointsToAdd < 1) pointsToAdd = Math.ceil(toAdd / 10); // fallback: 10m steps
            const step = toAdd / pointsToAdd;
            const timeStep = step / avgSpeed;
            let runningDistance = lastDistanceVal;
            logger.info("Adding points", { pointsToAdd, approxStep: step, targetDistance: roundedDistance });
            for (let i = 1; i <= pointsToAdd; i++) {
                runningDistance += step;
                // Round to 1 decimal place
                const distance = Math.round(runningDistance * 10) / 10;
                lastTimeAbs += timeStep;
                const point = new Point(lastLat, lastLong, {
                    ele: lastEle,
                    time: new Date(startTime.getTime() + (lastTimeAbs * 1000)),
                    hr: lastHr,
                    power: lastPower,
                    distance,
                    cad: lastCad // TODO - debug why lastCad is sometimes undefined/0
                });
                gpxPoints.push(point);
            }
        }

        logger.info("Completed activity (rounded down)", { name: activity.name, id: activity.id });
        const gpxData = new StravaBuilder();
        gpxData.setSegmentPoints(gpxPoints);
        const gpx = buildGPX(gpxData.toObject());
        const fileName = `/tmp/activity.gpx`;
        await fs.writeFileSync(fileName, gpx);

        // Backup file to S3 bucket for debugging
        const dateNow = new Date();
        const s3Key = `${athleteFirstName}-${athleteId}/${dateNow.toISOString()}/roundeddown-${activity.id}.gpx`;
        await saveToS3(s3Key, fileName);

        let response: any = {}

        const firstResp = await strava.uploads.post({
            activity_type: activity.sport_type,
            sport_type: activity.sport_type,
            data_type: 'gpx',
            name: activity.names,
            description: `Activity rounded down by streventools.com`,
            // @ts-ignore
            file: fileName,
            external_id: `streven-rd-${activity.id}`,
        }, function () {
            logger.info('First part of upload complete');
        });

        const { id: uploadId } = firstResp;

        // @ts-ignore
        await strava.uploads._check({
            id: uploadId
        }, function (err: any, res: any) {
            response = res;
            logger.info("Upload not yet complete",{error: err,response: res});
        });
        let timeout = 0;
        while (!response?.activity_id && !response?.error && timeout < 120000) {
            logger.info("Waiting for upload to complete...");
            timeout += 500;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (timeout >= 30000) {
            throw new Error("Timeout waiting for upload to complete");
        }
        logger.info('Second part of upload complete');

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

const handler = roundDown;

export { handler };
