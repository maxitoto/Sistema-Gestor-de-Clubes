const buenosAiresDateFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'America/Argentina/Buenos_Aires',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
});

export type DatePresetKey = 'hoy' | 'ultimos_7_dias' | 'mes_actual' | 'mes_anterior';

export interface DateRange {
	desde: string;
	hasta: string;
}

function isoFromUtcDate(date: Date): string {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function hoyBuenosAiresIso(reference: Date = new Date()): string {
	return buenosAiresDateFormatter.format(reference);
}

export function getDatePresetRange(key: DatePresetKey, reference: Date = new Date()): DateRange {
	const hoy = hoyBuenosAiresIso(reference);
	const [yearStr, monthStr, dayStr] = hoy.split('-');
	const year = Number(yearStr);
	const month = Number(monthStr);
	const day = Number(dayStr);

	if (key === 'hoy') {
		return { desde: hoy, hasta: hoy };
	}

	if (key === 'ultimos_7_dias') {
		const start = new Date(Date.UTC(year, month - 1, day - 6));
		return { desde: isoFromUtcDate(start), hasta: hoy };
	}

	if (key === 'mes_actual') {
		const start = new Date(Date.UTC(year, month - 1, 1));
		return { desde: isoFromUtcDate(start), hasta: hoy };
	}

	const prevStart = new Date(Date.UTC(year, month - 2, 1));
	const prevEnd = new Date(Date.UTC(year, month - 1, 0));
	return { desde: isoFromUtcDate(prevStart), hasta: isoFromUtcDate(prevEnd) };
}

export const DATE_PRESETS: readonly { key: DatePresetKey; label: string }[] = [
	{ key: 'hoy', label: 'Hoy' },
	{ key: 'ultimos_7_dias', label: 'Últimos 7 días' },
	{ key: 'mes_actual', label: 'Mes actual' },
	{ key: 'mes_anterior', label: 'Mes anterior' },
];

export function formatIsoDateArg(value: string | null | undefined): string {
	if (!value) {
		return '—';
	}
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
	if (!match) {
		return value;
	}
	return `${match[3]}/${match[2]}/${match[1]}`;
}
