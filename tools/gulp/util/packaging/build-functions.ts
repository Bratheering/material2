import {join, basename} from 'path';
import {createRollupBundle} from '../rollup-helper';
import {transpileFile} from '../ts-compiler';
import {ScriptTarget, ModuleKind} from 'typescript';
import {SOURCE_ROOT, DIST_ROOT, DIST_BUNDLES, PROJECT_ROOT} from '../../constants';
import {main as ngc} from '@angular/tsc-wrapped';

import {
  inlinePackageMetadataFiles,
  copyFiles,
  renameFiles,
  updatePackageVersion,
  createTypingFile,
  createMetadataFile,
  addPureAnnotationsToFile,
  uglifyFile,
  remapSourcemap,
  getSortedSecondaries,
  createPackageTsconfig,
  createSecondaryPackageFile
} from './build-utils';

/**
 * Copies different output files into a folder structure that follows the `angular/angular`
 * release folder structure. The output will also contain a README and the according package.json
 * file. Additionally the package will be Closure Compiler and AOT compatible.
 */
export function composeRelease(buildPackage: BuildPackage) {
  const {name, sourcePath, outputPath, releasePath} = buildPackage;

  const umdOutput = join(releasePath, 'bundles');
  const fesmOutput = join(releasePath, '@angular');

  inlinePackageMetadataFiles(outputPath);

  // Copy primary entry point bundles
  copyFiles(DIST_BUNDLES, `${name}.umd?(.min).js?(.map)`, umdOutput);
  copyFiles(DIST_BUNDLES, `${name}?(.es5).js?(.map)`, fesmOutput);

  // Copy secondary entry point bundles.
  copyFiles(DIST_BUNDLES, `${name}/!(*.umd)?(.min).js?(.map)`, fesmOutput);
  copyFiles(join(DIST_BUNDLES, name), `*.umd?(.min).js?(.map)`, umdOutput);

  copyFiles(outputPath, '**/*.+(d.ts|metadata.json)', join(releasePath, 'typings'));
  copyFiles(PROJECT_ROOT, 'LICENSE', releasePath);
  copyFiles(SOURCE_ROOT, 'README.md', releasePath);
  copyFiles(sourcePath, 'package.json', releasePath);

  // Rename all *-flat files to index files. This is temporary and can be removed once
  // the NGC supports having `index.ts` files as entry points for flat modules.
  renameFiles(releasePath, '**/*-flat.d.ts', 'index.d.ts');
  renameFiles(releasePath, '**/*-flat.metadata.json', 'index.metadata.json');

  updatePackageVersion(releasePath);
  createTypingFile(releasePath, name);
  createMetadataFile(releasePath, name);

  // Create package files for every secondary entry point.
  buildPackage.secondaries.forEach(secondary => createSecondaryPackageFile(secondary));
}

export async function createPackageOutput(buildPackage: BuildPackage) {
  // Create package output for each secondary package.
  for (const secondaryPackage of buildPackage.secondaries) {
    await createPackageOutput(secondaryPackage);
  }

  // Create a temporary tsconfig file for the current package.
  const packageTsconfig = createPackageTsconfig(buildPackage);

  // Build package using the Angular compiler.
  await ngc(packageTsconfig, {basePath: ''});

  await buildPackageBundles(buildPackage);
}


/** Builds the bundles for the specified package. */
async function buildPackageBundles(buildPackage: BuildPackage) {
  const {name, moduleName, outputPath, parent} = buildPackage;
  const entryFile = join(outputPath, `${name}-flat.js`);
  const bundlesPath = join(DIST_BUNDLES, parent ? parent.name : '');

  // List of paths to the package bundles.
  let fesm2015File = join(bundlesPath, `${name}.js`);
  let fesm2014File = join(bundlesPath, `${name}.es5.js`);
  let umdFile = join(bundlesPath, `${name}.umd.js`);
  let umdMinFile = join(bundlesPath, `${name}.umd.min.js`);

  // Build FESM-2015 bundle file.
  await createRollupBundle({
    moduleName: moduleName,
    entry: entryFile,
    dest: fesm2015File,
    format: 'es',
  });

  await remapSourcemap(fesm2015File);

  // Downlevel FESM-2015 file to ES5.
  transpileFile(fesm2015File, fesm2014File, {
    target: ScriptTarget.ES5,
    module: ModuleKind.ES2015,
    allowJs: true
  });

  // Add pure annotation to ES5 bundles.
  addPureAnnotationsToFile(fesm2014File);

  await remapSourcemap(fesm2014File);

  // Create UMD bundle of FESM-2014 output.
  await createRollupBundle({
    moduleName: moduleName,
    entry: fesm2014File,
    dest: umdFile,
    format: 'umd'
  });

  await remapSourcemap(umdFile);

  uglifyFile(umdFile, umdMinFile);

  await remapSourcemap(umdMinFile);
}

export class BuildPackage {

  /** Path to ESM output of the package. */
  outputPath: string = null;

  /** Path to the composed release of the package. */
  releasePath: string = null;

  /** Module name of the package. Used to built UMD bundles. */
  moduleName: string = null;

  /** Import name of the package. Used to generate package.json files. */
  importName: string = null;

  /** Build packages that can be secondary entry-points. */
  secondaries: BuildPackage[] = [];

  constructor(public name: string, public sourcePath: string, public parent?: BuildPackage) {
    this.outputPath = join(DIST_ROOT, 'packages', parent ? parent.name : '', name);
    this.releasePath = join(DIST_ROOT, 'releases', parent ? parent.name : name);
    this.moduleName =  parent ? `ng.${parent.name}.${name}` : `ng.${name}`;
    this.importName = `@angular/${parent ? parent.name + '/' : ''}${name}`;

    if (!parent) {
      // Resolve secondary packages by searching for folders inside of the current package.
      this.secondaries = getSortedSecondaries(this).map(pkgName => {
        return new BuildPackage(basename(pkgName), join(sourcePath, pkgName), this);
      });
    }
  }
}
