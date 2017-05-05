import {readFileSync, writeFileSync, mkdirpSync, copySync, existsSync} from 'fs-extra';
import {sync as glob} from 'glob';
import {basename, join, dirname} from 'path';
import {LICENSE_BANNER, MATERIAL_VERSION} from '../../constants';
import {addPureAnnotations} from './annotate-pure';
import {inlineMetadataResources} from './inline-resources';
import {BuildPackage} from './build-functions';

// There are no type definitions available for these imports.
const uglify = require('uglify-js');
const sorcery = require('sorcery');
const toposort = require('toposort');

/** Minifies a JavaScript file using UglifyJS. Also writes sourcemaps to the output. */
export function uglifyFile(inputPath: string, outputPath: string) {
  const sourcemapOut = `${outputPath}.map`;
  const result = uglify.minify(inputPath, {
    preserveComments: 'license',
    outSourceMap: sourcemapOut
  });

  writeFileSync(outputPath, result.code);
  writeFileSync(sourcemapOut, result.map);
}

/** Updates the `package.json` file of the specified package. Replaces the version placeholder. */
export function updatePackageVersion(packagePath: string) {
  const filePath = join(packagePath, 'package.json');
  const packageConfig = require(filePath);

  // Replace the `0.0.0-PLACEHOLDER` version name with the version of the root package.json file.
  packageConfig.version = packageConfig.version.replace('0.0.0-PLACEHOLDER', MATERIAL_VERSION);

  writeFileSync(filePath, JSON.stringify(packageConfig, null, 2));
}

/** Creates a metadata file that re-exports the metadata bundle inside of the typings. */
export function createMetadataFile(packageDir: string, packageName: string) {
  const metadataReExport =
      `{"__symbolic":"module","version":3,"metadata":{},"exports":[{"from":"./typings/index"}]}`;
  writeFileSync(join(packageDir, `${packageName}.metadata.json`), metadataReExport, 'utf-8');
}

/** Create a typing file that links to the bundled definitions of NGC. */
export function createTypingFile(outputDir: string, entryName: string) {
  writeFileSync(join(outputDir, `${entryName}.d.ts`),
    LICENSE_BANNER + '\nexport * from "./typings/index";'
  );
}

/** Inlines HTML and CSS resources into `metadata.json` files. */
export function inlinePackageMetadataFiles(packagePath: string) {
  // Create a map of fileName -> fullFilePath. This is needed because the templateUrl and
  // styleUrls for each component use just the filename because, in the source, the component
  // and the resources live in the same directory.
  const componentResources = new Map<string, string>();

  glob(join(packagePath, '**/*.+(html|css)')).forEach(resourcePath => {
    componentResources.set(basename(resourcePath), resourcePath);
  });

  // Find all metadata files. For each one, parse the JSON content, inline the resources, and
  // reserialize and rewrite back to the original location.
  glob(join(packagePath, '**/*.metadata.json')).forEach(path => {
    const metadata = JSON.parse(readFileSync(path, 'utf-8'));
    inlineMetadataResources(metadata, componentResources);
    writeFileSync(path , JSON.stringify(metadata), 'utf-8');
  });
}

/** Adds Uglify "@__PURE__" decorations to the specified file. */
export function addPureAnnotationsToFile(inputFile: string) {
  const originalContent = readFileSync(inputFile, 'utf-8');
  const annotatedContent = addPureAnnotations(originalContent);

  writeFileSync(inputFile, annotatedContent, 'utf-8');
}

/** Function to copy files using globs. Paths will be preserved when copying. */
export function copyFiles(fromPath: string, fileGlob: string, outDir: string) {
  glob(fileGlob, {cwd: fromPath}).forEach(filePath => {
    let fileDestPath = join(outDir, filePath);
    mkdirpSync(dirname(fileDestPath));
    copySync(join(fromPath, filePath), fileDestPath);
  });
}

/**
 * Finds the original sourcemap of the file and maps it to the current file.
 * This is useful when multiple transformation happen (e.g TSC -> Rollup -> Uglify)
 **/
export async function remapSourcemap(sourceFile: string) {
  // Once sorcery loaded the chain of sourcemaps, the new sourcemap will be written asynchronously.
  return (await sorcery.load(sourceFile)).write();
}

/**
 * Function that resolves all secondary packages of a build package. The dependencies will be
 * sorted using a topological graph.
 */
export function getSortedSecondaries(buildPackage: BuildPackage): string[] {
  const packages = glob('*/', {cwd: buildPackage.sourcePath}).map(pkgName => basename(pkgName));
  const depsPath = join(buildPackage.sourcePath, 'package-config.json');
  const depsConfig = existsSync(depsPath) ? require(depsPath) : {};
  const depsMap: string[][] = [];
  const globalDeps = depsConfig['*'] || [];

  packages.forEach(pkgName => {
    const pkgDeps = depsConfig[pkgName] || [];

    // Add global dependencie to each secondary package. Avoid cyclic dependencies.
    globalDeps
      .filter((globalDep: string) => globalDep !== pkgName)
      .forEach((depName: string) => depsMap.push([depName, pkgName]));

    // Add specific dependencies for the current secondary package.
    pkgDeps.forEach((depName: string) => depsMap.push([depName, pkgName]));
  });

  return toposort(depsMap);
}
