/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as semver from 'semver';

import {spawn} from '../../utils/child-process';
import {error, green, info, red} from '../../utils/console';
import {Spinner} from '../../utils/spinner';
import {NpmDistTag} from '../versioning';

import {FatalReleaseActionError} from './actions-error';
import {resolveYarnScriptForProject} from '../../utils/resolve-yarn-bin';
import {ReleaseBuildJsonStdout} from '../build/cli';
import {ReleaseInfoJsonStdout} from '../info/cli';

/*
 * ###############################################################
 *
 * This file contains helpers for invoking external `ng-dev` commands. A subset of actions,
 * like building release output or setting aν NPM dist tag for release packages, cannot be
 * performed directly as part of the release tool and need to be delegated to external `ng-dev`
 * commands that exist across arbitrary version branches.
 *
 * In a concrete example: Consider a new patch version is released and that a new release
 * package has been added to the `next` branch. The patch branch will not contain the new
 * release package, so we could not build the release output for it. To work around this, we
 * call the ng-dev build command for the patch version branch and expect it to return a list
 * of built packages that need to be released as part of this release train.
 *
 * ###############################################################
 */

/**
 * Invokes the `ng-dev release set-dist-tag` command in order to set the specified
 * NPM dist tag for all packages in the checked out branch to the given version.
 *
 * Optionally, the NPM dist tag update can be skipped for experimental packages. This
 * is useful when tagging long-term-support packages within NPM.
 */
export async function invokeSetNpmDistCommand(
  projectDir: string,
  npmDistTag: NpmDistTag,
  version: semver.SemVer,
  options: {skipExperimentalPackages: boolean} = {skipExperimentalPackages: false},
) {
  // Note: We cannot use `yarn` directly as command because we might operate in
  // a different publish branch and the current `PATH` will point to the Yarn version
  // that invoked the release tool. More details in the function description.
  const yarnCommand = await resolveYarnScriptForProject(projectDir);

  try {
    // Note: No progress indicator needed as that is the responsibility of the command.
    await spawn(
      yarnCommand.binary,
      [
        ...yarnCommand.args,
        '--silent',
        'ng-dev',
        'release',
        'set-dist-tag',
        npmDistTag,
        version.format(),
        `--skip-experimental-packages=${options.skipExperimentalPackages}`,
      ],
      {cwd: projectDir},
    );
    info(green(`  ✓   Set "${npmDistTag}" NPM dist tag for all packages to v${version}.`));
  } catch (e) {
    error(e);
    error(red(`  ✘   An error occurred while setting the NPM dist tag for "${npmDistTag}".`));
    throw new FatalReleaseActionError();
  }
}

/**
 * Invokes the `ng-dev release build` command in order to build the release
 * packages for the currently checked out branch.
 */
export async function invokeReleaseBuildCommand(
  projectDir: string,
): Promise<ReleaseBuildJsonStdout> {
  // Note: We cannot use `yarn` directly as command because we might operate in
  // a different publish branch and the current `PATH` will point to the Yarn version
  // that invoked the release tool. More details in the function description.
  const yarnCommand = await resolveYarnScriptForProject(projectDir);
  const spinner = new Spinner('Building release output.');

  try {
    // Since we expect JSON to be printed from the `ng-dev release build` command,
    // we spawn the process in silent mode. We have set up an Ora progress spinner.
    const {stdout} = await spawn(
      yarnCommand.binary,
      [...yarnCommand.args, '--silent', 'ng-dev', 'release', 'build', '--json'],
      {
        cwd: projectDir,
        mode: 'silent',
      },
    );
    spinner.complete();
    info(green('  ✓   Built release output for all packages.'));
    // The `ng-dev release build` command prints a JSON array to stdout
    // that represents the built release packages and their output paths.
    return JSON.parse(stdout.trim()) as ReleaseBuildJsonStdout;
  } catch (e) {
    spinner.complete();
    error(e);
    error(red('  ✘   An error occurred while building the release packages.'));
    throw new FatalReleaseActionError();
  }
}

/**
 * Invokes the `ng-dev release info` command in order to retrieve information
 * about the release for the currently checked-out branch.
 *
 * This is useful to e.g. determine whether a built package is currently
 * denoted as experimental or not.
 */
export async function invokeReleaseInfoCommand(projectDir: string): Promise<ReleaseInfoJsonStdout> {
  // Note: We cannot use `yarn` directly as command because we might operate in
  // a different publish branch and the current `PATH` will point to the Yarn version
  // that invoked the release tool. More details in the function description.
  const yarnCommand = await resolveYarnScriptForProject(projectDir);

  try {
    // Note: No progress indicator needed as that is expected to be a fast operation.
    const {stdout} = await spawn(
      yarnCommand.binary,
      [...yarnCommand.args, '--silent', 'ng-dev', 'release', 'info', '--json'],
      {
        cwd: projectDir,
        mode: 'silent',
      },
    );
    // The `ng-dev release info` command prints a JSON object to stdout.
    return JSON.parse(stdout.trim()) as ReleaseInfoJsonStdout;
  } catch (e) {
    error(e);
    error(
      red(
        `  ✘   An error occurred while retrieving the release information for ` +
          `the currently checked-out branch.`,
      ),
    );
    throw new FatalReleaseActionError();
  }
}

/**
 * Invokes the `yarn install` command in order to install dependencies for
 * the configured project with the currently checked out revision.
 */
export async function invokeYarnInstallCommand(projectDir: string): Promise<void> {
  // Note: We cannot use `yarn` directly as command because we might operate in
  // a different publish branch and the current `PATH` will point to the Yarn version
  // that invoked the release tool. More details in the function description.
  const yarnCommand = await resolveYarnScriptForProject(projectDir);

  try {
    // Note: No progress indicator needed as that is the responsibility of the command.
    // TODO: Consider using an Ora spinner instead to ensure minimal console output.
    await spawn(
      yarnCommand.binary,
      [...yarnCommand.args, 'install', '--frozen-lockfile', '--non-interactive'],
      {cwd: projectDir},
    );
    info(green('  ✓   Installed project dependencies.'));
  } catch (e) {
    error(e);
    error(red('  ✘   An error occurred while installing dependencies.'));
    throw new FatalReleaseActionError();
  }
}
