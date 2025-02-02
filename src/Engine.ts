import { BITAP } from "./Comparison/Bitap"
import { BY_VALUE } from "./Extraction/ByValue"
import { mergeArraySortFunctions } from "./Utility/JsonUtility"
import Document, { DocumentID } from "./Model/Document"
import SearchResult from "./Model/SearchResult"
import { RELEVANCE } from "./Sorting/Relevance"
import IOptions from "./Model/IOptions"
import IExtraction from "./Model/IExtraction"
import IComparison from "./Model/IComparison"
import IFilter from "./Model/IFilter"
import IWeight from "./Model/IWeight"
import IPreProcessor from "./Model/IPreProcessor"
import { TO_STRING, TO_LOWER_CASE, SCRUB } from "./PreProcessing/PreProcessingStrategy"
import { FULL_SCAN, FULL_SCAN_ASYNC } from "./Utility/Scan"
import { minMax } from "./Utility/MathUtils"
import Declaration from "./Model/Declaration"
import { Index } from "./Indexing/Index"
import IIndexOptions from "./Indexing/IIndexOptions"
import IClusterSpecification from "./Model/IClusterSpecification"
import ICluster from "./Model/ICluster"
import ISpelling from "./Model/ISpelling"
import { IFullTextScoring } from "./Model/IFullTextScoring"
import { QueryPlanner } from "./QueryPlanner/QueryPlanner"
import { IClusterQueryCriteria, IIndexQueryCriteria, IComparisonQueryCriteria, IQuery } from "./Model/IQuery"
import { createEmptyIndexDocument, createDocumentFromValue } from "./Utility/Helpers"
import { ISearchOptionsSearch, ISearchOptionsFullText, ISearchOptionsQuery } from "./Model/ISearchOptions"
import { ISpellingResult } from "./Model/ISpellingResult"
import { setMaxThreadCount, runManyInThread, setMaxIdleTime } from "./ThreadPlanner/ThreadPlanner"
import ISpellingSpecification from "./Model/ISpellingSpecification"
import IWordMeta from "./Model/IWordMeta"

export default class SearchEngine {
	/** Default Comparison function to be used for evaluating matches */
	private comparisonStrategy: IComparison
	/** The extraction strategy to use */
	private extractionStrategy: IExtraction
	/** Array containing the Sorting functions to be used. Search results will be sorted in order of sorting function provided. */
	private sortingStrategy: ((a: SearchResult, b: SearchResult) => number)[]
	/** Array of value processors to use for preprocessing the search data values */
	private preProcessingStrategy: IPreProcessor[]
	/** The full-text scoring strategy to use */
	private fullTextScoringStrategy: IFullTextScoring | null
	/** The index strategy to use */
	private indexStrategy: Index | null
	/** The cluster strategy to use */
	private clusterStrategy: ICluster[]
	/** The speller strategy to use */
	private spellingStrategy: ISpelling[]
	/** All words in the dataset */
	private allWords: Map<string, IWordMeta>
	/** The processed data set used for searching */
	private corpus: Document[]
	/** The original data set provided by the user */
	private originData: any[]
	/** Maximum number of matches before search ends */
	private limit: number | null
	/** Filters for what data should or should not be searchable */
	private filters: IFilter[]
	/** Weighted pattern functions */
	private weights: IWeight[]
	/** Should preprocessors be applied to the search term as well? */
	private isApplyPreProcessorsToTerm: boolean
	/** Query Planner for the engine */
	private queryPlanner: QueryPlanner
	/** Next available document identifier */
	private nextDocumentID = 0

	constructor(options?: IOptions) {
		this.comparisonStrategy = BITAP
		this.extractionStrategy = BY_VALUE
		this.fullTextScoringStrategy = null
		this.indexStrategy = null
		this.clusterStrategy = []
		this.spellingStrategy = []
		this.allWords = new Map()
		this.sortingStrategy = [RELEVANCE.DESCENDING]
		this.corpus = []
		this.originData = []
		this.limit = null
		this.filters = []
		this.weights = []
		this.preProcessingStrategy = [TO_STRING, TO_LOWER_CASE]
		this.isApplyPreProcessorsToTerm = true
		this.queryPlanner = new QueryPlanner(this)

		if (options) {
			options.threadPlanner && options.threadPlanner.maxThreadCount && setMaxThreadCount(options.threadPlanner.maxThreadCount)
			options.threadPlanner && options.threadPlanner.maxIdleTime && setMaxIdleTime(options.threadPlanner.maxIdleTime)
			options.comparison && this.setComparisonStrategy(options.comparison)
			options.extraction && this.setExtractionStrategy(options.extraction)
			options.sorting && this.setSortingStrategy(options.sorting)
			options.limit && this.setLimit(options.limit)
			options.filters && this.setFilters(options.filters)
			options.weights && this.setWeights(options.weights)
			options.preProcessing && this.setPreProcessingStrategy(options.preProcessing)
			options.fullTextScoringStrategy && this.setFullTextScoringStrategy(options.fullTextScoringStrategy)
			typeof options.applyPreProcessorsToTerm === "boolean" && (this.isApplyPreProcessorsToTerm = options.applyPreProcessorsToTerm)
			options.data && this.setDataset(options.data)
			if (options.indexing && options.indexing.enable) {
				this.setIndexStrategy(options.indexing.options, options.indexing.doNotBuild)
			}
			options.spelling && options.spelling.strategy && this.setSpellingStrategy(options.spelling.strategy, options.spelling.doNotBuild)
			options.clustering && options.clustering.strategy && this.setClusterStrategy(options.clustering.strategy, options.clustering.doNotBuild)
		}
	}

	setComparisonStrategy(strategy: IComparison): void {
		this.comparisonStrategy = strategy
	}

	setExtractionStrategy(strategy: IExtraction): void {
		this.extractionStrategy = strategy
	}

	setSortingStrategy(strategy: ((a: SearchResult, b: SearchResult) => number)[]): void {
		if (!Array.isArray(strategy)) {
			this.sortingStrategy = [strategy]
		} else {
			this.sortingStrategy = strategy
		}
	}

	setPreProcessingStrategy(strategy: IPreProcessor[]) {
		this.preProcessingStrategy = strategy
		this.prepareDataset()
	}

	setFilters(filters: IFilter[]): void {
		if (!filters || !Array.isArray(filters)) {
			this.filters = []
		} else {
			this.filters = filters
		}
		this.prepareDataset()
	}

	setDataset(datasetArray: any[]): void {
		this.originData = datasetArray
		this.prepareDataset()
	}

	addItem(item: any) {
		this.originData.push(item)
		const maxWeight = this.getMaxWeight()
		this.extractionStrategy(item).forEach(declarations => {
			this.corpus.push(new Document(this.nextDocumentID++, item, this.originData.length - 1, this.processDeclarations(declarations, maxWeight)))
		})
		if (this.indexStrategy) {
			this.indexStrategy.addDocument(this.corpus[this.corpus.length - 1])
		}
	}

	removeItem(item: any) {
		const index = this.originData.indexOf(item)
		if (index !== -1) {
			this.originData.splice(index, 1)
			const doc = <Document> this.corpus.find(doc => doc.originIndex === index)
			if (this.indexStrategy) {
				this.indexStrategy.removeDocument(doc)
			}
			this.corpus = this.corpus.filter(doc => doc.originIndex !== index)
		}
	}

	setLimit(limit: number): void {
		this.limit = limit
	}

	setWeights(weights: IWeight[]): void {
		if (!weights || !Array.isArray(weights)) {
			this.weights = []
		} else {
			this.weights = weights
		}
		this.prepareDataset()
	}

	setApplyPreProcessorsToTerm(shouldApply: boolean): void {
		this.isApplyPreProcessorsToTerm = shouldApply
	}

	/**
	 * Format the given array of data into an array of Document instances.
	 */
	prepareDataset(): void {
		const documents: Document[] = []
		const maxWeight = this.getMaxWeight()
		for (let i = 0; i < this.originData.length; i++) {
			const extractedDocuments = this.extractionStrategy(this.originData[i])
			for (let j = 0; j < extractedDocuments.length; j++) {
				const declarations = this.processDeclarations(extractedDocuments[j], maxWeight)
				documents.push(new Document(this.nextDocumentID++, this.originData[i], i, declarations))
			}
		}
		this.corpus = documents
	}

	getMaxWeight() {
		let maxWeight = 1
		const maxValue = Math.max(...this.weights.map(weight => weight[1]))
		maxValue > 1 && (maxWeight = maxValue)
		return maxWeight
	}

	/**
	 * Processes declarations by applying filters, preprocessors and weighting
	 * @param declarations - List to process
	 * @param maxWeight - Maximum weight recorded
	 */
	processDeclarations(declarations: Declaration[], maxWeight: number) {
		return declarations
			.filter(declaration => this.filters.every(filter => filter(declaration.path, declaration.originValue)))
			.map(declaration => {
				if (this.weights.length > 0) {
					declaration.weight = 1
					const customWeight = this.weights.find(weight => weight[0](declaration.path, declaration.originValue))
					if (customWeight) {
						declaration.weight = customWeight[1]
					}
					declaration.normalizedWeight = minMax(declaration.weight, maxWeight, 0)
				}
				declaration.value = this.applyPreProcessors(declaration.value)
				return declaration
			})
	}

	setFullTextScoringStrategy(strategy: IFullTextScoring) {
		this.fullTextScoringStrategy = strategy
	}

	setIndexStrategy(options?: IIndexOptions, doNotBuild?: boolean) {
		const index = new Index(this.corpus, options)
		if (!doNotBuild) {
			index.build()
		}
		this.indexStrategy = index
	}

	buildIndex() {
		if (this.indexStrategy) {
			this.indexStrategy.build()
		}
	}

	setClusterStrategy(clusterSpecifications: IClusterSpecification[], doNotBuild?: boolean) {
		this.clusterStrategy = clusterSpecifications.map(specification => {
			return new specification.cluster(specification.id, specification.options)
		})
		if (!doNotBuild) {
			this.buildClusters()
		}
	}

	buildClusters() {
		const documents = this.indexStrategy
			? this.indexStrategy.getAllIndexDocuments()
			: this.corpus.map(doc => ({
				document: doc,
				tokenMap: new Map(),
				vector: []
			  }))
		const statistics = this.indexStrategy
			? this.indexStrategy.getStatistics()
			: {
				numberOfDocuments: this.corpus.length,
				numberOfTokens: -1,
				averageDocumentLength: -1
			  }
		this.clusterStrategy.forEach(cluster => {
			cluster.build(documents, statistics)
		})
	}

	setSpellingStrategy(spellerSpecifications: ISpellingSpecification[], doNotBuild?: boolean) {
		this.spellingStrategy = spellerSpecifications.map(specification => new specification.speller(specification.id, specification.options))
		if (!doNotBuild) {
			this.buildSpellers()
		}
	}

	buildSpellers() {
		this.allWords = new Map()
		this.corpus.forEach(doc => {
			doc.declarations.forEach(declaration => {
				if (typeof declaration.originValue === "string") {
					SCRUB(declaration.originValue)
						.split(" ")
						.map((word: string) => word.toLowerCase())
						.forEach((word: string) => {
							!this.allWords.has(word) && this.allWords.set(word, { count: 0 })
							this.allWords.get(word)!.count += 1
						})
				}
			})
		})
		this.spellingStrategy.forEach(speller => speller.build(this.allWords))
	}

	/**
	 * If preprocessors should be applied to the term then this will return the applied value, otherwise the original value.
	 * @param value - Value to process
	 */
	getProcessedTermValue(value: any) {
		if (this.isApplyPreProcessorsToTerm) {
			return this.applyPreProcessors(value)
		}
		return value
	}

	/**
	 * Applies all preprocessor to a given value.
	 * @param value - Value to process
	 */
	applyPreProcessors(value: any) {
		const result = this.preProcessingStrategy.reduce((acc, processor) => {
			acc = processor(acc)
			return acc
		}, value)
		return result
	}

	sortSearchResults(list: SearchResult[]) {
		if (this.sortingStrategy.length > 0) {
			list.sort(mergeArraySortFunctions(this.sortingStrategy))
		}
		return list
	}

	checkSpelling(value: string, id?: string): ISpellingResult {
		if (!this.spellingStrategy.length) {
			throw new Error("No spelling strategy configured")
		}
		const strategies = id ? this.spellingStrategy.filter(strategy => strategy.id === id) : this.spellingStrategy
		if (!strategies.length) {
			throw new Error("No such spelling strategy: " + id)
		}
		const words: string[] = SCRUB(this.applyPreProcessors(value))
			.split(" ")
			.map((word: string) => word.toLowerCase())
		const result: ISpellingResult = {
			result: "",
			corrections: []
		}
		words
			.filter(word => !this.allWords.has(word))
			.forEach(word => {
				let suggestion = null
				strategies.some(strategy => {
					suggestion = strategy.evaluate(word)
					return suggestion
				})
				suggestion && result.corrections.push({ word, suggestion })
			})
		result.result = result.corrections.reduce((acc, correction) => {
			return value.split(correction.word).join(correction.suggestion)
		}, value)
		return result
	}

	/**
	 * Executes an inexact K retrieval using clustering
	 * @param criteria - Criteria
	 * @param value - Optional root search value
	 */
	clusterRetrieval(criteria: IClusterQueryCriteria, value?: any): DocumentID[] {
		const cluster = this.clusterStrategy.find(cluster => cluster.id === criteria.id)
		if (!cluster) {
			throw new Error("No such cluster found: " + criteria.id)
		}
		let indexDocument = createEmptyIndexDocument()
		if (value) {
			const processedValue = this.getProcessedTermValue(value)
			indexDocument.document = createDocumentFromValue(processedValue)
			if (this.indexStrategy) {
				indexDocument = this.indexStrategy.getQueryIndexDocument(indexDocument.document)
			}
		}
		return cluster.evaluate(indexDocument, criteria.options)
	}

	/**
	 * Executes an inexact K retrieval using a full-text index
	 * @param criteria - Criteria
	 * @param filter - Optional filtered corpus by ID
	 */
	indexRetrieval(criteria: IIndexQueryCriteria, filter?: DocumentID[]): DocumentID[] {
		if (!this.indexStrategy) {
			throw new Error("No index strategy has been configured!")
		}
		const value = this.applyPreProcessors(criteria.value) //Always apply preprocessors for index retrieval
		return this.indexStrategy.inexactKRetrievalByValue(value, filter, criteria.exact, criteria.field)
	}

	/**
	 * Executes an inexact K retrieval using value comparison
	 * @param criteria - Criteria
	 * @param filter - Optional filtered corpus by ID
	 */
	comparisonRetrieval(criteria: IComparisonQueryCriteria, filter?: DocumentID[]): DocumentID[] {
		const strategy = criteria.strategy ? criteria.strategy : this.comparisonStrategy
		const value = this.getProcessedTermValue(criteria.value)
		let documentArray = this.corpus
		if (filter) {
			const filterSet = new Set(filter)
			documentArray = documentArray.filter(doc => filterSet.has(doc.id))
		}
		return documentArray
			.filter(doc => {
				let declarations = doc.declarations
				if (criteria.field) {
					declarations = doc.declarations.filter(declaration => declaration.normalizedPath === criteria.field)
				}
				return declarations.find(declaration => strategy(value, declaration.value))
			})
			.map(doc => doc.id)
	}

	/**
	 * Executes an async inexact K retrieval using value comparison
	 * @param criteria - Criteria
	 * @param filter - Optional filtered corpus by ID
	 */
	async comparisonRetrievalAsync(criteria: IComparisonQueryCriteria, filter?: DocumentID[]): Promise<DocumentID[]> {
		const strategy = criteria.strategy ? criteria.strategy : this.comparisonStrategy
		const value = this.getProcessedTermValue(criteria.value)
		let documentArray = this.corpus
		if (filter) {
			const filterSet = new Set(filter)
			documentArray = documentArray.filter(doc => filterSet.has(doc.id))
		}
		const matches: Document[] = []
		const promises = documentArray.reduce((acc: Promise<any>[], doc) => {
			let declarations = doc.declarations
			if (criteria.field) {
				declarations = doc.declarations.filter(declaration => declaration.normalizedPath === criteria.field)
			}
			if (declarations.length) {
				acc.push(
					runManyInThread(strategy, ...declarations.map(declaration => [value, declaration.value])).then(result => {
						if (result && result.some((resultItem: any) => resultItem && (typeof resultItem === "number" || resultItem.score))) {
							matches.push(doc)
						}
					})
				)
			}
			return acc
		}, [])
		await Promise.all(promises)
		return matches.map(doc => doc.id)
	}

	search(searchValueIn: any, options?: ISearchOptionsSearch): SearchResult[] {
		const searchValue = this.getProcessedTermValue(searchValueIn)
		let data = this.corpus
		if (options?.filter) {
			const filterIDs = new Set(this.queryPlanner.executeQuery(options.filter))
			data = this.corpus.filter(doc => filterIDs.has(doc.id))
		}
		const searchResult = FULL_SCAN(data, searchValue, this.comparisonStrategy, options?.limit ? options.limit : this.limit)
		this.sortSearchResults(searchResult)
		return searchResult
	}

	async searchAsync(searchValueIn: any, options?: ISearchOptionsSearch): Promise<SearchResult[]> {
		const searchValue = this.getProcessedTermValue(searchValueIn)
		let data = this.corpus
		if (options?.filter) {
			const filterIDs = new Set(await this.queryPlanner.executeQueryAsync(options.filter))
			data = this.corpus.filter(doc => filterIDs.has(doc.id))
		}
		const searchResult = await FULL_SCAN_ASYNC(data, searchValue, this.comparisonStrategy, options?.limit ? options.limit : this.limit)
		this.sortSearchResults(searchResult)
		return searchResult
	}

	fulltext(searchValue: any, options?: ISearchOptionsFullText): SearchResult[] {
		if (!this.indexStrategy) {
			throw new Error("No index strategy has been configured!")
		}
		if (!this.fullTextScoringStrategy) {
			throw new Error("No full-text scoring strategy has been configured!")
		}
		const value = this.applyPreProcessors(searchValue) //Always apply preprocessors for index retrieval
		const tokenMap = this.indexStrategy!.getQueryTokenMapFromValue(value)
		let filter = undefined
		if (options?.filter) {
			filter = this.queryPlanner.executeQuery(options.filter)
		}
		const exact = options?.exact ? options.exact : undefined
		const field = options?.field ? options.field : undefined
		let documentIDs = this.indexStrategy!.inexactKRetrievalByTokenMap(tokenMap, filter, exact, field)
		if (!documentIDs.length) {
			return []
		}
		const limit = options?.limit ? options.limit : this.limit
		if (limit && limit <= documentIDs.length) {
			documentIDs = documentIDs.splice(0, limit)
		}
		const sparseVectors = this.indexStrategy!.getSparseIndexVectorsFromArray(tokenMap, documentIDs)
		const searchResult = sparseVectors.map(vectors => {
			const score = this.fullTextScoringStrategy!(vectors.vector1, vectors.vector2)
			if (typeof score === "number") {
				return new SearchResult(vectors.document.origin, vectors.document.originIndex, [], "", score, score, 0, 0)
			}
			return new SearchResult(vectors.document.origin, vectors.document.originIndex, [], "", score.score, score.score, 0, 0, score)
		})
		this.sortSearchResults(searchResult)
		return searchResult
	}

	async fulltextAsync(searchValue: any, options?: ISearchOptionsFullText): Promise<SearchResult[]> {
		if (!this.indexStrategy) {
			throw new Error("No index strategy has been configured!")
		}
		if (!this.fullTextScoringStrategy) {
			throw new Error("No full-text scoring strategy has been configured!")
		}
		const value = this.applyPreProcessors(searchValue) //Always apply preprocessors for index retrieval
		const tokenMap = this.indexStrategy!.getQueryTokenMapFromValue(value)
		let filter = undefined
		if (options?.filter) {
			filter = await this.queryPlanner.executeQueryAsync(options.filter)
		}
		const exact = options?.exact ? options.exact : undefined
		const field = options?.field ? options.field : undefined
		let documentIDs = this.indexStrategy!.inexactKRetrievalByTokenMap(tokenMap, filter, exact, field)
		if (!documentIDs.length) {
			return []
		}
		const limit = options?.limit ? options.limit : this.limit
		if (limit && limit <= documentIDs.length) {
			documentIDs = documentIDs.splice(0, limit)
		}
		const sparseVectors = this.indexStrategy!.getSparseIndexVectorsFromArray(tokenMap, documentIDs)
		const searchResult = sparseVectors.map(vectors => {
			const score = this.fullTextScoringStrategy!(vectors.vector1, vectors.vector2)
			if (typeof score === "number") {
				return new SearchResult(vectors.document.origin, vectors.document.originIndex, [], "", score, score, 0, 0)
			}
			return new SearchResult(vectors.document.origin, vectors.document.originIndex, [], "", score.score, score.score, 0, 0, score)
		})
		this.sortSearchResults(searchResult)
		return searchResult
	}

	query(query: IQuery, options?: ISearchOptionsQuery): SearchResult[] {
		const resultIDs = this.queryPlanner.executeQuery(query)
		return this.processQueryResult(resultIDs, options)
	}

	async queryAsync(query: IQuery, options?: ISearchOptionsQuery): Promise<SearchResult[]> {
		const resultIDs = await this.queryPlanner.executeQueryAsync(query)
		return this.processQueryResult(resultIDs, options)
	}

	processQueryResult(resultIDs: number[], options?: ISearchOptionsQuery) {
		const limit = options?.limit ? options.limit : this.limit
		if (limit && limit <= resultIDs.length) {
			resultIDs = resultIDs.slice(0, limit)
		}
		const resultIDsSet = new Set(resultIDs)
		const searchResult = this.corpus
			.filter(doc => resultIDsSet.has(doc.id))
			.map(doc => new SearchResult(doc.origin, doc.originIndex, [], "", 1, 0, 0, 0, null))
		this.sortSearchResults(searchResult)
		return searchResult
	}
}
