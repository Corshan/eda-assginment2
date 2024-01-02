import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class EdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    const imageTable = new dynamodb.Table(this, "ImageTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "fileName", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Images"
    });

    // Output

    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });

    // Integration infrastructure
    const badImageQueue = new sqs.Queue(this, "bad-image-queue", {
      retentionPeriod: cdk.Duration.minutes(30)
    });

    const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        queue: badImageQueue,
        maxReceiveCount: 1
      }
    });

    const imageTopic = new sns.Topic(this, "ImageTopic", {
      displayName: "Image topic",
    });

    // Lambda functions

    const processImageFn = new lambdanode.NodejsFunction(
      this,
      "ProcessImageFn",
      {
        // architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/processImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imageTable.tableName
        }
      }
    );

    const deleteImageFn = new lambdanode.NodejsFunction(
      this,
      "DeletImageFn",
      {
        // architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/process-delete.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imageTable.tableName
        }
      }
    );

    const updateImageFn = new lambdanode.NodejsFunction(
      this,
      "UpdateImageFn",
      {
        // architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/update-table.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imageTable.tableName
        }
      }
    );

    const confirmationMailerFn = new lambdanode.NodejsFunction(this, "confirmation-mailer-function", {
      runtime: lambda.Runtime.NODEJS_16_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/confirmation-mailer.ts`,
    });

    const rejectionMailerFn = new lambdanode.NodejsFunction(
      this, "rejection-mailer-function", {
        runtime: lambda.Runtime.NODEJS_16_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/rejection-mailer.ts`,
      });

    // Event triggers

    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(imageTopic)  // Changed
    );

    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      new s3n.SnsDestination(imageTopic)
    )

   imageTopic.addSubscription(
      new subs.SqsSubscription(imageProcessQueue,{
        filterPolicyWithMessageBody: {
          Records: sns.FilterOrPolicy.policy({
            eventName: sns.FilterOrPolicy.filter(
              sns.SubscriptionFilter.stringFilter({
                matchPrefixes: ['ObjectCreated']
              })
            )
          })
        }
      }) 
    );

    imageTopic.addSubscription(
      new subs.LambdaSubscription(deleteImageFn,{
        filterPolicyWithMessageBody: {
          Records: sns.FilterOrPolicy.policy({
            eventName: sns.FilterOrPolicy.filter(
              sns.SubscriptionFilter.stringFilter({
                matchPrefixes: ['ObjectRemoved']
              })
            )
          })
        }
      } )
    );

    imageTopic.addSubscription(
      new subs.LambdaSubscription(confirmationMailerFn)
    );

    imageTopic.addSubscription(
      new subs.LambdaSubscription(updateImageFn, {
        filterPolicy: {
          object_name: sns.SubscriptionFilter.stringFilter({
            matchPrefixes: ['fileName']
          })
        }
      })
    )

    const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(10),
    });

    processImageFn.addEventSource(newImageEventSource);

    rejectionMailerFn.addEventSource(new events.SqsEventSource(badImageQueue));

    // Permissions

    imagesBucket.grantRead(processImageFn);
    imageTable.grantWriteData(processImageFn);
    imageTable.grantReadWriteData(deleteImageFn);
    imageTable.grantReadWriteData(updateImageFn);

    confirmationMailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    rejectionMailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

  }
}
