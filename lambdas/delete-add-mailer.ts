import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import type { DynamoDBStreamHandler, DynamoDBStreamEvent } from "aws-lambda";
import {
    SESClient,
    SendEmailCommand,
    SendEmailCommandInput,
} from "@aws-sdk/client-ses";

const client = new SESClient({ region: "eu-west-1" });

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
    throw new Error(
        "Please add the SES_EMAIL_TO, SES_EMAIL_FROM and SES_REGION environment variables in an env.js file located in the root directory"
    );
}

type ContactDetails = {
    name: string;
    email: string;
    message: string;
};

export const handler: DynamoDBStreamHandler = async (event) => {
    console.log("Event => ", event);
    const records = event.Records;

    for (const record of records) {
        console.log("Record =>", record)
        const dbEventName = record.eventName;

        const dynamodb = record.dynamodb;

        console.log(dynamodb);


        try {
            let message: string = ""

            if (dbEventName == "INSERT") {
                message = `Added ${dynamodb?.Keys?.fileName.S} to the Album`
                console.log(dynamodb?.Keys?.fileName.S)
            } else if (dbEventName == "MODIFY") {
                if(dynamodb?.OldImage?.content){
                    message =
                    `${dynamodb?.NewImage?.fileName.S} description was changed, from ${dynamodb?.OldImage?.content.S} to ${dynamodb?.NewImage?.content.S}`
                }else {
                    message = `${dynamodb?.NewImage?.fileName.S} description was changed, to ${dynamodb?.NewImage?.content.S}`
                }
            } else if (dbEventName == "REMOVE") {
                message = `${dynamodb?.Keys?.fileName.S} was deleted`
            }

            const details: ContactDetails = {
                name: "The Photo Album",
                email: SES_EMAIL_FROM,
                message: message,
            };

            const params = sendEmailParams(details);
            await client.send(new SendEmailCommand(params));
        } catch (error: unknown) {
            console.log("ERROR is: ", error);
            // return;
        }
    }
}

function sendEmailParams({ name, email, message }: ContactDetails) {
    const parameters: SendEmailCommandInput = {
        Destination: {
            ToAddresses: [SES_EMAIL_TO],
        },
        Message: {
            Body: {
                Html: {
                    Charset: "UTF-8",
                    Data: getHtmlContent({ name, email, message }),
                },
                // Text: {
                //   Charset: "UTF-8",
                //   Data: getTextContent({ name, email, message }),
                // },
            },
            Subject: {
                Charset: "UTF-8",
                Data: `New image Upload`,
            },
        },
        Source: SES_EMAIL_FROM,
    };
    return parameters;
}

function getHtmlContent({ name, email, message }: ContactDetails) {
    return `
      <html>
        <body>
          <h2>Sent from: </h2>
          <ul>
            <li style="font-size:18px">👤 <b>${name}</b></li>
            <li style="font-size:18px">✉️ <b>${email}</b></li>
          </ul>
          <p style="font-size:18px">${message}</p>
        </body>
      </html> 
    `;
}