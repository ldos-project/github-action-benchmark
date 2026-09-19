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
exports.uploadArchiveToRelease = exports.releaseTagFromArchive = exports.repoSlug = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
function repoSlug(ghRepository) {
    if (ghRepository) {
        const parts = ghRepository
            .replace(/\.git$/, '')
            .split('/')
            .filter(Boolean);
        const repo = parts.pop();
        const owner = parts.pop();
        if (!owner || !repo) {
            throw new Error(`Cannot determine owner/repo from gh-repository '${ghRepository}'`);
        }
        return { owner, repo };
    }
    return github.context.repo;
}
exports.repoSlug = repoSlug;
function releaseTagFromArchive(archiveFile) {
    return path.basename(archiveFile).replace(/\.(tar\.(gz|bz2|xz|zst)|tgz|tar|zip)$/, '');
}
exports.releaseTagFromArchive = releaseTagFromArchive;
/// Creates (or reuses) the release for `tag` and uploads `archiveFile` to it.
/// Returns the release page URL.
async function uploadArchiveToRelease(archiveFile, tag, token, ghRepository) {
    var _a;
    if (!fs.existsSync(archiveFile)) {
        throw new Error(`archive-file '${archiveFile}' does not exist`);
    }
    const { owner, repo } = repoSlug(ghRepository);
    const octokit = github.getOctokit(token);
    let release;
    try {
        release = (await octokit.rest.repos.createRelease({
            owner,
            repo,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            tag_name: tag,
            name: tag,
        })).data;
        core.debug(`Created release ${tag} in ${owner}/${repo}`);
    }
    catch (err) {
        core.debug(`Could not create release ${tag} (${err.message}); reusing the existing one`);
        release = (await octokit.rest.repos.getReleaseByTag({ owner, repo, tag })).data;
    }
    const name = path.basename(archiveFile);
    const existing = ((_a = release.assets) !== null && _a !== void 0 ? _a : []).find((a) => a.name === name);
    if (existing) {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        await octokit.rest.repos.deleteReleaseAsset({ owner, repo, asset_id: existing.id });
    }
    await octokit.rest.repos.uploadReleaseAsset({
        owner,
        repo,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        release_id: release.id,
        name,
        data: fs.readFileSync(archiveFile),
    });
    core.info(`Uploaded ${name} to release ${release.html_url}`);
    return release.html_url;
}
exports.uploadArchiveToRelease = uploadArchiveToRelease;
//# sourceMappingURL=release.js.map