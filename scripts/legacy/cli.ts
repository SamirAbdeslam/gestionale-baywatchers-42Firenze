import { parseArgs, type ParseArgsConfig } from 'node:util';
import { pathToFileURL } from 'node:url';

export function cliArgs(options: ParseArgsConfig['options']) {
	const args = process.argv.slice(2);
	return parseArgs({ args: args[0] === '--' ? args.slice(1) : args, options }).values;
}
export function isMain(url: string) {
	return process.argv[1] !== undefined && url === pathToFileURL(process.argv[1]).href;
}
