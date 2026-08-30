/** Douglas–Peucker 抽稀（迭代实现），用于大轨迹渲染减负。tol 单位：度。 */
export function simplify(pts: Array<[number, number]>, tol: number): Array<[number, number]> {
	const n = pts.length;
	if (n <= 2) return pts.slice();

	const sqTol = tol * tol;
	const keep = new Uint8Array(n);
	keep[0] = keep[n - 1] = 1;

	const stack: Array<[number, number]> = [[0, n - 1]];
	while (stack.length) {
		const [first, last] = stack.pop()!;
		const [x1, y1] = pts[first];
		const [x2, y2] = pts[last];
		const dx = x2 - x1;
		const dy = y2 - y1;
		const segSq = dx * dx + dy * dy;

		let maxSq = 0;
		let idx = -1;
		for (let i = first + 1; i < last; i++) {
			const [x, y] = pts[i];
			// 点到弦的垂距（弦退化为点时按到端点距离）
			let t = segSq === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / segSq;
			t = t < 0 ? 0 : t > 1 ? 1 : t;
			const px = x1 + t * dx - x;
			const py = y1 + t * dy - y;
			const sq = px * px + py * py;
			if (sq > maxSq) {
				maxSq = sq;
				idx = i;
			}
		}
		if (maxSq > sqTol && idx > 0) {
			keep[idx] = 1;
			stack.push([first, idx], [idx, last]);
		}
	}

	const out: Array<[number, number]> = [];
	for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
	return out;
}
