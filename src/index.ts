import * as core from '@actions/core';
import * as glob from 'glob'; // Added glob import
import { configFromJobInput } from './config';
import { extractResult } from './extract';
import { writeBenchmark } from './write';
import { releaseTagFromArchive, uploadArchiveToRelease } from './release';

async function main() {
    // Get the file path pattern from input
    const outputFilePathPattern = core.getInput('output-file-path', { required: true });
    core.debug(`Output file path pattern: ${outputFilePathPattern}`);

    // Find all files matching the pattern
    const files = glob.sync(outputFilePathPattern);
    core.debug(`Found files: ${files}`);

    if (files.length === 0) {
        core.setFailed(`No files found matching pattern "${outputFilePathPattern}"`);
        return;
    }

    // Uploaded once for the whole run, not per config file.
    const archiveFile = core.getInput('archive-file');
    let releaseUrl: string | undefined;
    if (archiveFile) {
        const releaseTag = releaseTagFromArchive(archiveFile);
        const token = core.getInput('github-token', { required: true });
        releaseUrl = await uploadArchiveToRelease(
            archiveFile,
            releaseTag,
            token,
            core.getInput('gh-repository') || undefined,
        );
    }

    // Process each file
    for (const file of files) {
        core.info(`Processing file: ${file}`);
        try {
            // Get config, passing the specific file path
            // Assumes configFromJobInput is modified to accept the file path
            // and read config details *from* that file, using the path for outputFilePath.
            const config = await configFromJobInput(file); // Pass file path here
            core.debug(`Config extracted for ${file}: ${JSON.stringify(config)}`);

            // Extract results using the specific config for this file
            const bench = await extractResult(config);
            if (releaseUrl) {
                bench.releaseUrl = releaseUrl;
            }
            core.debug(`Benchmark result extracted for ${file}: ${JSON.stringify(bench)}`);

            // Write benchmark data using the specific config
            await writeBenchmark(bench, config);

            core.info(`Processed benchmark data for ${file}`);
        } catch (error: any) {
            // Log warning and continue processing other files if one fails
            core.warning(`Failed to process file ${file}: ${error.message}`);
        }
    }

    console.log('github-action-benchmark processing complete!');
}

main().catch((e) => core.setFailed(e.message));
