import { Injectable } from '@angular/core';
import { saveAs } from 'filesaver.js';
import * as JSZip from 'jszip';
import * as JSZipUtils from 'jszip-utils';
import {
    ContentManagementClient,
    IContentManagementClient,
    IContentManagementClientConfig,
} from 'kentico-cloud-content-management';
import { Observable } from 'rxjs';
import { flatMap, map } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { observableHelper } from '../../utilities';
import { BaseService } from '../base-service';
import { CmFetchService } from '../fetch/cm-fetch.service';
import { DeliveryFetchService } from '../fetch/delivery-fetch.service';
import { IImportData, IImportFromProjectWithCMConfig, IImportFromProjectWithDeliveryConfig } from '../import/import.models';
import { IExportJsonResult } from './export.models';

@Injectable()
export class ExportService extends BaseService {

    constructor(
        private cmFetchService: CmFetchService,
        private deliveryFetchService: DeliveryFetchService
    ) {
        super();
    }

    preparePackageWithDeliveryApi(projectId: string, languageCodenames: string[]): Observable<IExportJsonResult> {
        const result: IExportJsonResult = {
            contentItems: [],
            contentTypes: [],
            taxonomies: [],
            assets: [],
            languageVariants: [],
        };

        return this.deliveryFetchService.getAllTypes(projectId, []).pipe(
            flatMap(types => {
                result.contentTypes.push(...types);
                return this.deliveryFetchService.getAllContentItems(projectId, languageCodenames);
            }),
            flatMap(contentItemsResult => {
                result.assets.push(...contentItemsResult.assets);
                result.contentItems.push(...contentItemsResult.contentItems);
                result.languageVariants.push(...contentItemsResult.languageVariants);

                return this.deliveryFetchService.getAllTaxonomies(projectId, []);
            }),
            map(taxonomies => {
                result.taxonomies.push(...taxonomies);

                return result;
            })
        );
    }

    preparePackageWithCMApi(projectId: string, projectApiKey: string): Observable<IExportJsonResult> {
        const result: IExportJsonResult = {
            contentItems: [],
            contentTypes: [],
            taxonomies: [],
            assets: [],
            languageVariants: [],
        };

        return this.cmFetchService.getAllTypes(projectId, projectApiKey, []).pipe(
            flatMap(types => {
                result.contentTypes.push(...types);

                return this.cmFetchService.getAllContentItems(projectId, projectApiKey, []);
            }),
            flatMap(contentItems => {
                result.contentItems.push(...contentItems);
                return this.cmFetchService.getLanguageVariantsForContentItems(projectId, projectApiKey, {
                    contentItems: contentItems,
                    contentTypes: result.contentTypes
                });
            }),
            flatMap(languageVariants => {
                result.languageVariants.push(...languageVariants);
                return this.cmFetchService.getAllTaxonomies(projectId, projectApiKey, []);
            }),
            flatMap(taxonomies => {
                result.taxonomies.push(...taxonomies);
                return this.cmFetchService.getAllAssets(projectId, projectApiKey, []);
            }),
            map(assets => {
                result.assets.push(...assets);

                return result;
            })
        );
    }

    createAndDownloadZipFile(projectId: string, data: IExportJsonResult, callback: (() => void)): void {
        const zip = new JSZip();

        zip.file(environment.export.filenames.contentTypes, JSON.stringify(data.contentTypes));
        zip.file(environment.export.filenames.contentItems, JSON.stringify(data.contentItems));
        zip.file(environment.export.filenames.taxonomies, JSON.stringify(data.taxonomies));
        zip.file(environment.export.filenames.assets, JSON.stringify(data.assets));
        zip.file(environment.export.filenames.languageVariants, JSON.stringify(data.languageVariants));

        const assetsFolder = zip.folder(environment.export.filenames.assetsFolder);

        for (const asset of data.assets) {
            const assetSubFolder = assetsFolder.folder(asset.id);
            const assetFilename = asset.fileName;
            assetSubFolder.file(
                assetFilename,
                this.urlToPromise(asset.deliveryUrl),
                {
                    binary: true
                });
        }

        zip.generateAsync({ type: 'blob' }).then((content: any) => {
            saveAs(content, `${environment.export.filenames.packagePrefix}${projectId}.zip`);
            callback();
        });
    }

    exportDataFromProjectUsingDeliveryApi(config: IImportFromProjectWithDeliveryConfig ): Observable<IImportData> {
        const targetContentManagementClient = this.getContentManagementClient({
            projectId: config.targetProjectId,
            apiKey: config.targetProjectCmApiKey
        });

        const data: IImportData = {
            targetClient: targetContentManagementClient,
            contentTypes: [],
            contentItems: [],
            taxonomies: [],
            assetsFromFile: [],
            languageVariants: [],
            assets: [],
            targetProjectId: config.targetProjectId
        };

        return this.deliveryFetchService.getAllTypes(config.sourceProjectId, []).pipe(
            flatMap(types => {
                data.contentTypes.push(...types);
                return this.deliveryFetchService.getAllContentItems(config.sourceProjectId, config.languages);
            }),
            flatMap(contentItemsResult => {
                data.assets.push(...contentItemsResult.assets);
                data.contentItems.push(...contentItemsResult.contentItems);
                data.languageVariants.push(...contentItemsResult.languageVariants);

                return this.deliveryFetchService.getAllTaxonomies(config.sourceProjectId, []);
            }),
            map(taxonomies => {
                data.taxonomies.push(...taxonomies);

                return data;
            })
        );
    }

    exportDataFromProjectWithCMApi(config: IImportFromProjectWithCMConfig): Observable<IImportData> {
        const sourceContentManagementClient = this.getContentManagementClient({
            projectId: config.sourceProjectId,
            apiKey: config.sourceProjectCmApiKey
        });

        const targetContentManagementClient = this.getContentManagementClient({
            projectId: config.targetProjectId,
            apiKey: config.targetProjectCmApiKey
        });

        const data: IImportData = {
            targetClient: targetContentManagementClient,
            contentTypes: [],
            contentItems: [],
            taxonomies: [],
            assetsFromFile: [],
            languageVariants: [],
            assets: [],
            targetProjectId: config.targetProjectId
        };

        const obs: Observable<void>[] = [
            this.cmFetchService.getAllAssets(config.sourceProjectId, config.sourceProjectCmApiKey, []).pipe(
                map((response) => {
                    data.assets = response;
                })
            ),
            this.cmFetchService.getAllTypes(config.sourceProjectId, config.sourceProjectCmApiKey, []).pipe(
                map((response) => {
                    data.contentTypes = response;
                })
            ),
            this.cmFetchService.getAllContentItems(config.sourceProjectId, config.sourceProjectCmApiKey, []).pipe(
                map((response) => {
                    data.contentItems = response;
                })
            ),
            this.cmFetchService.getAllTaxonomies(config.sourceProjectId, config.sourceProjectCmApiKey, []).pipe(
                map((response) => {
                    data.taxonomies = response;
                })
            ),
        ];

        return observableHelper.zipObservables(obs).pipe(
            flatMap(() => {
                return this.cmFetchService.getLanguageVariantsForContentItems(config.sourceProjectId, config.sourceProjectCmApiKey, {
                    contentItems: data.contentItems,
                    contentTypes: data.contentTypes
                });
            }),
            map(response => {
                data.languageVariants = response;
                return data;
            })
        );
    }

    private getContentManagementClient(config: IContentManagementClientConfig): IContentManagementClient {
        return new ContentManagementClient(config);
    }

    private urlToPromise(url: string): Promise<any> {
        return new Promise((resolve, reject) => {
            JSZipUtils.getBinaryContent(url, (err: any, data: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }
}
