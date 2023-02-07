export function propsEqual(
	a: Record<string, any>,
	b: Record<string, any>,
): boolean {
	const keysA = Object.keys(a || {}).filter((k) => a[k] !== undefined);
	const keysB = Object.keys(b || {}).filter((k) => b[k] !== undefined);

	if (keysA.length !== keysB.length) {
		return false;
	}

	for (const key of keysA) {
		if (a[key] !== b[key]) {
			return false;
		}
	}

	return true;
}
