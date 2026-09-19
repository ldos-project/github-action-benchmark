import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';

export function repoSlug(ghRepository: string | undefined): { owner: string; repo: string } {
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

export function releaseTagFromArchive(archiveFile: string): string {
    return path.basename(archiveFile).replace(/\.(tar\.(gz|bz2|xz|zst)|tgz|tar|zip)$/, '');
}

/// Creates (or reuses) the release for `tag` and uploads `archiveFile` to it.
/// Returns the release page URL.
export async function uploadArchiveToRelease(
    archiveFile: string,
    tag: string,
    token: string,
    ghRepository: string | undefined,
): Promise<string> {
    if (!fs.existsSync(archiveFile)) {
        throw new Error(`archive-file '${archiveFile}' does not exist`);
    }

    const { owner, repo } = repoSlug(ghRepository);
    const octokit = github.getOctokit(token);

    let release;
    try {
        release = (
            await octokit.rest.repos.createRelease({
                owner,
                repo,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                tag_name: tag,
                name: tag,
            })
        ).data;
        core.debug(`Created release ${tag} in ${owner}/${repo}`);
    } catch (err: any) {
        core.debug(`Could not create release ${tag} (${err.message}); reusing the existing one`);
        release = (await octokit.rest.repos.getReleaseByTag({ owner, repo, tag })).data;
    }

    const name = path.basename(archiveFile);
    const existing = (release.assets ?? []).find((a: { name: string }) => a.name === name);
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
        data: fs.readFileSync(archiveFile) as unknown as string,
    });

    core.info(`Uploaded ${name} to release ${release.html_url}`);
    return release.html_url;
}
