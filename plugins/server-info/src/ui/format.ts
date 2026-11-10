export const formatCount = (n: number | undefined): string =>
	n == null ? '—' : n.toLocaleString()
