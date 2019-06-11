import { Injectable } from '@angular/core';
import { MediaObserver } from '@angular/flex-layout';
import { Router } from '@angular/router';

import {
    CleanupService,
    ExportService,
    GoogleAnalyticsService,
    ImportDataStorageService,
    ImportService,
    ProcessingService,
    TemplatesService,
} from '../services';

@Injectable({
    providedIn: 'root'
})
export class ComponentDependencies {

    constructor(
        public importService: ImportService,
        public cleanupService: CleanupService,
        public exportService: ExportService,
        public processingService: ProcessingService,
        public media: MediaObserver,
        public router: Router,
        public templatesService: TemplatesService,
        public googleAnalyticsService: GoogleAnalyticsService,
        public importDataStorageService: ImportDataStorageService,
    ) { }
}
