import path from 'node:path';
export function resolveTemplatePath(): string {
    return path.resolve(__dirname, '../data/template.html');
}
