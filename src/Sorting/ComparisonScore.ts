import SearchResult from "../Model/SearchResult"

/**
 * Sorts search results by their comparison score.
 * Use the ASCENDING or DESCENDING property to set the direction.
 */
export const COMPARISON_SCORE = {
	DESCENDING: (a: SearchResult, b: SearchResult): number => {
		if (a.comparisonScore < b.comparisonScore) return 1
		if (a.comparisonScore > b.comparisonScore) return -1
		return 0
	},
	ASCENDING: (a: SearchResult, b: SearchResult): number => {
		if (a.comparisonScore < b.comparisonScore) return -1
		if (a.comparisonScore > b.comparisonScore) return 1
		return 0
	}
}
