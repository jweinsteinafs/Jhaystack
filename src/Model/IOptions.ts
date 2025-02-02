import SearchResult from "./SearchResult"
import IComparison from "./IComparison"
import IFilter from "./IFilter"
import IWeight from "./IWeight"
import IPreProcessor from "./IPreProcessor"
import IExtraction from "./IExtraction"
import IIndexOptions from "../Indexing/IIndexOptions"
import IClusterSpecification from "./IClusterSpecification"
import { IFullTextScoring } from "./IFullTextScoring"
import ISpellingSpecification from "./ISpellingSpecification"

export default interface IOptions {
	/** Default comparison function to be used for evaluating matches. */
	comparison?: IComparison
	/** Sets the extraction strategy to be used. I.e. how documents should be extracted from the dataset. */
	extraction?: IExtraction
	/** Sets the scoring function used for comparing full-text vector matches. */
	fullTextScoringStrategy?: IFullTextScoring
	/** Sets the indexing strategy to be used */
	indexing?: {
		enable: boolean
		options?: IIndexOptions
		doNotBuild?: boolean
	}
	/** Sets the cluster strategy to be used */
	clustering?: {
		strategy: IClusterSpecification[]
		doNotBuild?: boolean
	}
	/** Sets the spelling strategy to use */
	spelling?: {
		strategy: ISpellingSpecification[]
		doNotBuild?: boolean
	}
	/** Array containing the Sorting functions to be used. Search results will be sorted in order of sorting function provided. */
	sorting?: ((a: SearchResult, b: SearchResult) => number)[]
	/** Options related to the thread planner */
	threadPlanner?: {
		/** Maximum amount threads allowed to run in parallel */
		maxThreadCount?: number
		/** Maximum idle wait time before a worker thread is terminated (in ms) */
		maxIdleTime?: number
	}
	/** Maximum number of matches before search ends */
	limit?: null | number
	/** Filters for what data should or should not be searchable */
	filters?: IFilter[]
	/** Weight functions that determine how certain property paths and values should be weighed in terms of their relevance. */
	weights?: IWeight[]
	/** Pre processor functions used for preprocessing the provided search data. E.g. "make all strings upper case", or "make all data objects into a string of format yyyy-MM-dd". */
	preProcessing?: IPreProcessor[]
	/** Should preprocessors be applied to the search term as well? */
	applyPreProcessorsToTerm?: boolean
	/** Array of data to be searched */
	data?: any[]
}
