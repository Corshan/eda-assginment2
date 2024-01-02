import { SNSHandler, SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Image, createDDbDocClient } from "../shared/utils";
import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const s3 = new S3Client();

const ddbClient = createDDbDocClient();

export const handler: SNSHandler = async (event) => {
  console.log("Event ", event);
  for (const record of event.Records) {
    const recordBody = record.Sns;
    console.log("Record Body => ", recordBody)
    const message = JSON.parse(recordBody.Message)
    console.log('Raw SNS message ',message)

    for (const mess of message.Records){
        const key = mess.s3.object.key
        console.log("Key =>", key)

        await ddbClient.send(
            new DeleteCommand({
              TableName: process.env.TABLE_NAME,
              Key: {
                  fileName: key
              }
            })
          )
      }
    }
};