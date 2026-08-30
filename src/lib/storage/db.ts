import { openDB, type IDBPDatabase } from 'idb';
import type { TrackData, TrackSummary } from '../types.ts';

/**
 * IndexedDB 存储（浏览器本地持久化，无任何服务端）。
 * 三个对象仓按读取粒度拆分，列表页不加载大数组：
 * - tracks:    轨迹摘要（列表页）
 * - trackData: 全量几何（地图页）
 * - files:     原始 KML 文件 Blob（未来重新解析用）
 */

interface K2MSchema {
	tracks: { key: string; value: TrackSummary };
	trackData: { key: string; value: TrackData };
	files: { key: string; value: { id: string; blob: Blob } };
}

const DB_NAME = 'kml2map';
const DB_VERSION = 1;

let dbp: Promise<IDBPDatabase<K2MSchema>> | null = null;

function db(): Promise<IDBPDatabase<K2MSchema>> {
	dbp ??= openDB<K2MSchema>(DB_NAME, DB_VERSION, {
		upgrade(d) {
			if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'id' });
			if (!d.objectStoreNames.contains('trackData'))
				d.createObjectStore('trackData', { keyPath: 'id' });
			if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' });
		}
	});
	return dbp;
}

export function newTrackId(): string {
	return crypto.randomUUID();
}

export async function saveTrack(summary: TrackSummary, data: TrackData, file: Blob): Promise<void> {
	const d = await db();
	const tx = d.transaction(['tracks', 'trackData', 'files'], 'readwrite');
	await Promise.all([
		tx.objectStore('tracks').put(summary),
		tx.objectStore('trackData').put(data),
		tx.objectStore('files').put({ id: summary.id, blob: file }),
		tx.done
	]);
}

/** 按导入时间倒序 */
export async function listSummaries(): Promise<TrackSummary[]> {
	const d = await db();
	const all = await d.getAll('tracks');
	return all.sort((a, b) => b.importedAt - a.importedAt);
}

export async function loadTrack(
	id: string
): Promise<{ summary: TrackSummary; data: TrackData } | null> {
	const d = await db();
	const [summary, data] = await Promise.all([d.get('tracks', id), d.get('trackData', id)]);
	if (!summary || !data) return null;
	return { summary, data };
}

export async function deleteTrack(id: string): Promise<void> {
	const d = await db();
	const tx = d.transaction(['tracks', 'trackData', 'files'], 'readwrite');
	await Promise.all([
		tx.objectStore('tracks').delete(id),
		tx.objectStore('trackData').delete(id),
		tx.objectStore('files').delete(id),
		tx.done
	]);
}
