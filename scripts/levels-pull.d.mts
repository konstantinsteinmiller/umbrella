export declare const OVERRIDES_FILE: string
export declare const ORDER_FILE: string
export declare const pullLevels: (bucketUrl: string | undefined, file?: string, orderFile?: string) => Promise<{ ok: boolean; changed: number; message: string }>
