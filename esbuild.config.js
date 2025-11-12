import { build } from 'esbuild';
import pkg from './package.json';

/* Exclude all peerDependencies automatically */
const externals = Object.keys(pkg.peerDependencies || {});

await build({
    entryPoints: ['dist/main.js'],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'node',
    outfile: 'dist/main.mjs',
    keepNames: true,
    external: externals,
    allowOverwrite: true,
});