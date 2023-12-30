import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Image, createDDbDocClient } from "../shared/utils";
import { PutCommand } from "@aws-sdk/lib-dynamodb";

const s3 = new S3Client();

const ddbClient = createDDbDocClient();

export const handler: SQSHandler = async (event) => {
  console.log("Event ", event);
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);
    const message = JSON.parse(recordBody.Message)
    console.log('Raw SNS message ',message)
  
    if (message.Records) {
      for (const messageRecord of message.Records) {
        const s3e = messageRecord.s3;
        const srcBucket = s3e.bucket.name;
        // Object key may have spaces or unicode non-ASCII characters.
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
        // Infer the image type from the file suffix.
        const typeMatch = srcKey.match(/\.([^.]*)$/);
        if (!typeMatch) {
          console.log("Could not determine the image type.");
          throw new Error("Could not determine the image type. ");
        }
        // Check that the image type is supported
        const imageType = typeMatch[1].toLowerCase();
        if (imageType != "jpeg" && imageType != "png") {
          console.log(`Unsupported image type: ${imageType}`);
          throw new Error("Unsupported image type: ${imageType. ");
        }
        // process image upload 

        await ddbClient.send(
          new PutCommand({
            TableName: process.env.TABLE_NAME,
            Item: {
              fileName: srcKey
            } as Image
          })
        )
      }
    }
  }
};