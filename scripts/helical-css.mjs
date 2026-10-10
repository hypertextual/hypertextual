import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const helical = resolve(process.env.HELICAL_UI ?? resolve(homedir(), 'Projects/helical-ui'));
const quote = path => JSON.stringify(path.replaceAll('\\', '/'));
const css = `@import "tailwindcss";
@import ${quote(resolve(helical, 'libs/helical-ui/src/theme.css'))};
@source ${quote(resolve(helical, 'libs/helical-react/src'))};
@source ${quote(resolve(helical, 'libs/helical-ui/src'))};
`;
writeFileSync(fileURLToPath(new URL('../apps/web/src/helical.generated.css', import.meta.url)), css);
