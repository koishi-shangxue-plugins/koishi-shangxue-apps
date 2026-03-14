import { Context, Service, Schema } from 'koishi';
export interface Config {
    enablecommand: any;
}
export declare const name = "qrcode-service-null";
export declare const Config: Schema<Config>;
export declare const usage = "\n\u4E3Akoishi\u901A\u8FC7\u4E8C\u7EF4\u7801\u751F\u6210\u670D\u52A1\n\n[\u4F7F\u7528\u65B9\u6CD5\u8BF7\u89C1readme](https://www.npmjs.com/package/koishi-plugin-qrcode-service-null)\n\n";
declare module 'koishi' {
    interface Context {
        qrcode: qrcode;
    }
}
export declare class qrcode extends Service {
    constructor(ctx: Context);
    generateQRCode(text: string, options: any): Promise<string>;
}
export declare function apply(ctx: Context, config: Config): void;
