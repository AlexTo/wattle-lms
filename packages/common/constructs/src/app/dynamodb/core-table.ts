import { Construct } from 'constructs';
import { AttributeType, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';
import { DynamoDBTable, DynamoDBTableProps } from '../../core/dynamodb.js';
import { findWorkspaceRoot } from '../../core/workspace.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const { runtimeConfigKey, tableConfig } = JSON.parse(
  readFileSync(
    join(
      findWorkspaceRoot(fileURLToPath(new URL(import.meta.url))),
      'packages/databases/core-table/config.json',
    ),
    'utf-8',
  ),
) as {
  runtimeConfigKey: string;
  tableConfig: {
    globalSecondaryIndexes: {
      indexName: string;
      partitionKey: string;
      sortKey?: string;
    }[];
  };
};

export type CoreTableProps = Omit<DynamoDBTableProps, 'runtimeConfigKey'>;

export class CoreTable extends DynamoDBTable {
  constructor(scope: Construct, id: string, props?: CoreTableProps) {
    super(scope, id, {
      ...props,
      runtimeConfigKey,
    });

    for (const gsi of tableConfig.globalSecondaryIndexes) {
      this.table.addGlobalSecondaryIndex({
        indexName: gsi.indexName,
        partitionKey: { name: gsi.partitionKey, type: AttributeType.STRING },
        ...(gsi.sortKey && {
          sortKey: { name: gsi.sortKey, type: AttributeType.STRING },
        }),
        projectionType: ProjectionType.ALL,
      });
    }
  }
}
