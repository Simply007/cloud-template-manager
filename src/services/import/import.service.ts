import { Injectable } from '@angular/core';
import * as JSZip from 'jszip';
import {
    ContentManagementClient,
    IContentManagementClient,
    IContentManagementClientConfig,
} from 'kentico-cloud-content-management';
import { from, Observable } from 'rxjs';
import { flatMap, map } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { observableHelper } from '../../utilities';
import { DeliveryFetchService } from '../fetch/delivery-fetch.service';
import { IContentItemModel, IContentTypeModel, ITaxonomyModel } from '../shared/shared.models';
import { WorkflowService } from '../workflow/workflow.service';
import {
    IImportConfig,
    IImportData,
    IImportFromFileConfig,
    IImportFromProjectConfig,
    IImportResult,
    IPublishItemRequest,
} from './import.models';
import { ContentItemsImportService } from './types/content-items-import.service';
import { ContentTypesImportService } from './types/content-types-import.service';
import { TaxonomiesImportService } from './types/taxonomies-import.service';

@Injectable()
export class ImportService {

    constructor(
        private contentTypesImportService: ContentTypesImportService,
        private contentItemsImportService: ContentItemsImportService,
        private taxonomiesImportService: TaxonomiesImportService,
        private deliveryFetchService: DeliveryFetchService,
        private workflowService: WorkflowService
    ) {
    }

    importFromFile(config: IImportFromFileConfig, exportZipFile: File): Observable<IImportResult> {
        const cmClient = this.getContentManagementClient({
            apiKey: config.apiKey,
            projectId: config.projectId
        });

        return from(JSZip.loadAsync(exportZipFile)).pipe(
            flatMap((response: any) => {
                const obs: Observable<void>[] = [];

                const importData: IImportData = {
                    contentItems: [],
                    contentTypes: [],
                    taxonomies: [],
                    targetClient: cmClient
                };

                // taxonomies
                obs.push(
                    this.readJsonFile(response, environment.export.filenames.taxonomies).pipe(
                        map(taxonomiesString => {
                            const taxonomies = JSON.parse(taxonomiesString) as ITaxonomyModel[];
                            importData.taxonomies = taxonomies;
                        })
                    )
                );

                // content types
                obs.push(
                    this.readJsonFile(response, environment.export.filenames.contentTypes).pipe(
                        map(contentTypesString => {
                            const contentTypes = JSON.parse(contentTypesString) as IContentTypeModel[];
                            importData.contentTypes = contentTypes;
                        })
                    )
                );

                // content items
                obs.push(
                    this.readJsonFile(response, environment.export.filenames.contentItems).pipe(
                        map(contentItemsString => {
                            const contentItems = JSON.parse(contentItemsString) as IContentItemModel[];
                            importData.contentItems = contentItems;
                        })
                    )
                );

                return observableHelper.zipObservables(obs).pipe(
                    map(() => {
                        return importData;
                    })
                );
            }),
            flatMap((importData) => {
                return this.import(importData, {
                    processItem: config.processItem
                });
            }),
            map(result => {
                return result;
            })
        )
    }

    importFromProject(config: IImportFromProjectConfig): Observable<IImportResult> {
        return this.getImportDataFromProject(config).pipe(
            flatMap(data => {
                return this.import(data, config);
            }),
            map((response) => {
                return response;
            })
        );
    }

    import(data: IImportData, config: IImportConfig): Observable<IImportResult> {
        const result: IImportResult = {
            importedContentItems: [],
            importedContentTypes: [],
            importedLanguageVariants: [],
            importedTaxonomies: [],
            publishedItems: [],
            assets: []
        };
        return this.contentTypesImportService.importContentTypes(data, config).pipe(
            flatMap((response) => {
                result.importedContentTypes = response;

                return this.taxonomiesImportService.importTaxonomies(data, config).pipe(
                    map((response) => {
                        result.importedTaxonomies = response;
                        return data;
                    })
                )
            }),
            flatMap((data) => {
                return this.contentItemsImportService.importContentItems(data, config).pipe(
                    map((response) => {
                        result.importedContentItems = response.contentItems;
                        result.importedLanguageVariants = response.languageVariants;
                        result.assets = response.assets;
                        return data;
                    })
                )
            }),
            flatMap((data) => {
                return this.workflowService.publishContentItems(data.contentItems.map(item => <IPublishItemRequest>{
                    itemCodename: item.system.codename,
                    languageCodename: item.system.language
                }), data.targetClient, config).pipe(
                    map((response) => {
                        result.publishedItems = response;
                        return data;
                    })
                )
            }),
            map(() => {
                // all finished
                return result;
            })
        );
    }

    private readJsonFile(response: any, filename: string): Observable<string> {
        const files = response.files;
        const file = files[filename];

        if (!file) {
            throw Error(`Invalid file '${filename}'`);
        }

        return from(file.async('text')).pipe(
            map(data => data as string)
        );
    }

    private getImportDataFromProject(config: IImportFromProjectConfig): Observable<IImportData> {
        const targetContentManagementClient = this.getContentManagementClient({
            projectId: config.targetProjectId,
            apiKey: config.targetProjectCmApiKey
        })

        const data: IImportData = {
            targetClient: targetContentManagementClient,
            contentTypes: [],
            contentItems: [],
            taxonomies: []
        };

        const obs: Observable<void>[] = [
            this.deliveryFetchService.getAllTypes(config.sourceProjectId, []).pipe(
                map((response) => {
                    data.contentTypes = response;
                })
            ),
            this.deliveryFetchService.getAllContentItems(config.sourceProjectId, []).pipe(
                map((response) => {
                    data.contentItems = response;
                })
            ),
            this.deliveryFetchService.getAllTaxonomies(config.sourceProjectId, []).pipe(
                map((response) => {
                    data.taxonomies = response;
                })
            ),
        ];

        return observableHelper.zipObservables(obs).pipe(
            map(() => data)
        );
    }

    private getContentManagementClient(config: IContentManagementClientConfig): IContentManagementClient {
        return new ContentManagementClient(config);
    }
}
