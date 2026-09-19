"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const glob = __importStar(require("glob")); // Added glob import
const config_1 = require("./config");
const extract_1 = require("./extract");
const write_1 = require("./write");
const release_1 = require("./release");
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
    let releaseUrl;
    if (archiveFile) {
        const releaseTag = (0, release_1.releaseTagFromArchive)(archiveFile);
        const token = core.getInput('github-token', { required: true });
        releaseUrl = await (0, release_1.uploadArchiveToRelease)(archiveFile, releaseTag, token, core.getInput('gh-repository') || undefined);
    }
    // Process each file
    for (const file of files) {
        core.info(`Processing file: ${file}`);
        try {
            // Get config, passing the specific file path
            // Assumes configFromJobInput is modified to accept the file path
            // and read config details *from* that file, using the path for outputFilePath.
            const config = await (0, config_1.configFromJobInput)(file); // Pass file path here
            core.debug(`Config extracted for ${file}: ${JSON.stringify(config)}`);
            // Extract results using the specific config for this file
            const bench = await (0, extract_1.extractResult)(config);
            if (releaseUrl) {
                bench.releaseUrl = releaseUrl;
            }
            core.debug(`Benchmark result extracted for ${file}: ${JSON.stringify(bench)}`);
            // Write benchmark data using the specific config
            await (0, write_1.writeBenchmark)(bench, config);
            core.info(`Processed benchmark data for ${file}`);
        }
        catch (error) {
            // Log warning and continue processing other files if one fails
            core.warning(`Failed to process file ${file}: ${error.message}`);
        }
    }
    console.log('github-action-benchmark processing complete!');
}
main().catch((e) => core.setFailed(e.message));
//# sourceMappingURL=index.js.map