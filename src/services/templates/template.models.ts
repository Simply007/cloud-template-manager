export interface ITemplate {
    name: string;
    description: string;
    repoUrl: string;
    exportPackageUrl: string;
    imageUrl: string;
    author: {
        name: string;
        email: String;
    };
    technology: string;

    lastUpdate?: Date;
    version?: string;
}
