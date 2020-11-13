import Index from "../Model/Index"
import Shard from "../Model/Shard"
import IndexEvaluationResult from "../Model/IndexEvaluationResult"

/**
 * Index strategy that will check for values that start with the provided term.
 */
export class StartsWithIndex extends Index {
	tag: string

	constructor(shards: Shard[]) {
		super(shards)
		this.tag = "STARTS_WITH"
	}

	extractStringTokens(string: string) {
		const tokens = []
		const length = string.length
		for (let i = 0; i < length; i++) {
			tokens.push(string.slice(0, i + 1).toUpperCase())
		}
		return tokens
	}

	evaluate(term: unknown): IndexEvaluationResult[] {
		const results = this.index[`${term}`.toUpperCase()]
		if (results) {
			return results.map(shard => {
				return new IndexEvaluationResult(shard, 1)
			})
		}
		return []
	}
}
