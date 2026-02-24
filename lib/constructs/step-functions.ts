import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config';

export interface StepFunctionsConstructProps {
  config: EnvironmentConfig;
  investigationHandler: lambda.Function;
  familyLoopTopic: sns.Topic;
}

/**
 * Step Functions Workflow Construct
 * 
 * Creates an Express Workflow for multi-step fraud investigation:
 * 1. Analyze - Deep analysis of fraud indicators
 * 2. Escalate - Determine escalation level based on score
 * 3. Notify - Send notifications to family members
 * 4. Log - Record investigation results
 * 
 * Uses Express Workflow for high-volume, short-duration processing (<5 min)
 */
export class StepFunctionsConstruct extends Construct {
  public readonly fraudInvestigationWorkflow: sfn.StateMachine;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: StepFunctionsConstructProps) {
    super(scope, id);

    const { config, investigationHandler, familyLoopTopic } = props;

    // Create CloudWatch Log Group for Step Functions execution logs
    this.logGroup = new logs.LogGroup(this, 'StepFunctionsLogGroup', {
      logGroupName: `/aws/stepfunctions/vocalshield-fraud-investigation-${config.tags.Environment}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Step 1: Analyze - Invoke Investigation Lambda
    const analyzeTask = new tasks.LambdaInvoke(this, 'Analyze', {
      lambdaFunction: investigationHandler,
      payload: sfn.TaskInput.fromObject({
        'sessionId.$': '$.sessionId',
        'fraudScore.$': '$.fraudScore',
        'timestamp.$': '$.timestamp',
        'action': 'analyze',
      }),
      resultPath: '$.analysisResult',
      retryOnServiceExceptions: true,
    });

    // Step 2: Escalate - Determine escalation level
    const escalateChoice = new sfn.Choice(this, 'Escalate')
      .when(
        sfn.Condition.numberGreaterThanEquals('$.fraudScore', 90),
        new sfn.Pass(this, 'HighSeverity', {
          result: sfn.Result.fromObject({ severity: 'HIGH', actionRequired: true }),
          resultPath: '$.escalation',
        })
      )
      .when(
        sfn.Condition.numberGreaterThanEquals('$.fraudScore', 70),
        new sfn.Pass(this, 'MediumSeverity', {
          result: sfn.Result.fromObject({ severity: 'MEDIUM', actionRequired: true }),
          resultPath: '$.escalation',
        })
      )
      .otherwise(
        new sfn.Pass(this, 'LowSeverity', {
          result: sfn.Result.fromObject({ severity: 'LOW', actionRequired: false }),
          resultPath: '$.escalation',
        })
      );

    // Step 3: Notify - Send SNS notification
    const notifyTask = new tasks.SnsPublish(this, 'Notify', {
      topic: familyLoopTopic,
      message: sfn.TaskInput.fromObject({
        'default': sfn.JsonPath.format(
          'VocalShield Fraud Alert\n\nSession: {}\nFraud Score: {}\nSeverity: {}\nAction Required: {}\nTimestamp: {}',
          sfn.JsonPath.stringAt('$.sessionId'),
          sfn.JsonPath.stringAt('$.fraudScore'),
          sfn.JsonPath.stringAt('$.escalation.severity'),
          sfn.JsonPath.stringAt('$.escalation.actionRequired'),
          sfn.JsonPath.stringAt('$.timestamp')
        ),
      }),
      resultPath: '$.notificationResult',
    });

    // Step 4: Log - Record investigation results
    const logTask = new sfn.Pass(this, 'Log', {
      parameters: {
        'sessionId.$': '$.sessionId',
        'fraudScore.$': '$.fraudScore',
        'severity.$': '$.escalation.severity',
        'actionRequired.$': '$.escalation.actionRequired',
        'timestamp.$': '$.timestamp',
        'status': 'COMPLETED',
      },
    });

    // Define workflow with error handling
    const definition = analyzeTask
      .addCatch(new sfn.Pass(this, 'AnalysisError', {
        result: sfn.Result.fromObject({ error: 'Analysis failed' }),
        resultPath: '$.error',
      }), {
        errors: ['States.ALL'],
        resultPath: '$.error',
      })
      .next(escalateChoice);

    // Connect escalation paths to notification
    const highSeverityPath = escalateChoice.afterwards().next(notifyTask);
    notifyTask.next(logTask);

    // Create Express State Machine for high-volume processing
    this.fraudInvestigationWorkflow = new sfn.StateMachine(this, 'FraudInvestigationWorkflow', {
      stateMachineName: `VocalShield-FraudInvestigation-${config.tags.Environment}`,
      definition,
      stateMachineType: sfn.StateMachineType.EXPRESS,
      logs: {
        destination: this.logGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: true, // Enable X-Ray tracing
    });

    // Apply tags
    cdk.Tags.of(this.fraudInvestigationWorkflow).add('Component', 'StepFunctions');
    cdk.Tags.of(this.logGroup).add('Component', 'StepFunctions');
  }
}
