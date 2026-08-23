import { Construct } from 'constructs';
import * as url from 'url';
import { StaticWebsite } from '../../core/index.js';

export class StudentPortal extends StaticWebsite {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      websiteName: 'StudentPortal',
      websiteFilePath: url.fileURLToPath(
        new URL(
          '../../../../../../dist/packages/websites/student-portal/bundle',
          import.meta.url,
        ),
      ),
    });
  }
}
