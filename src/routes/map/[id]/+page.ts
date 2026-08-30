import { error } from '@sveltejs/kit';
import { loadTrack } from '$lib/storage/db';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	const track = await loadTrack(params.id);
	if (!track) throw error(404, '轨迹不存在或已删除');
	return track;
};
