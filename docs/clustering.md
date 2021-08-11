# Clustering Strategy

Clusters are like plugins that can be used for faster and more appropriate inexact k retrieval. Clusters are typically useful for when you either have mid to large size data sets and need to squeeze out every bit of performance that you can, or when you are in need of some form of special use case functionality. Clusters have a build-phase and must be constructed before they can be used.

Clusters can be passed options, both at build time as well as at query time.

Note that some clusters require a built index in order to function, while others do not. Remember to check the documentation of each cluster to make sure.

To configure a cluster you do the following:

```javascript
import { Jhaystack, ClusteringStrategy } from "jhaystack"

const options = {
    clustering: {
        options: [
            {
                id: "kmeans",
                cluster: ClusteringStrategy.KMEANS,
                options: {
                    maxRepetition: 20
                }
            }
        ]
    }
}
const se = new Jhaystack(options)

//You can also build the clusters manually:
se.setClusterStrategy( [
    {
        id: "kmeans",
        cluster: ClusteringStrategy.KMEANS,
        options: {
            maxRepetition: 20
        }
    }
], true)
se.buildClusters()
```

Clusters can be queried using filters at search time. Check out the search API for more information.

Jhaystack comes with the following clusters built in:

> ## KMeans

KMeans will compute groups of documents based on a KMeans algorithm applied to the documents’ vectors. You can either supply the amount of groups to create, or let Jhaystack make a guesstimate. You can also specify how many cycles Jhaystack should loop through in trying to optimize the groupings. Beware of setting this to -1 since it could lead to very long cluster construction times for large datasets.

The following options can be configured at **build time**:
 - **k** 
   - **Description**: *Number of clusters. If set to -1 the optimal number will be estimated by the algorithm.*
   - **Type**: `number`
   - **Default**: `-1`
 - **maxRepetition** 
   - **Description**: *Number of times to run the readjustment algorithm. A higher number becomes more accurate, a lower number executes faster at build time.*
   - **Type**: `number`
   - **Default**: `10`

No options can be passed at **query time**

> ## Range

Range allows you to query for ranges of values, for example numbers and dates. This cluster requires that you specify a field to be used. The index will then map all values on these field, and allow you to retrieve all documents using greater than/less than operators. The cluster internally uses a form of binary search, so beware that it does not have a constant lookup time.

The following options can be configured at **build time**:
 - **field** 
   - **Description**: *Field that cluster should be based on formatted as a "." joined string of the property path*
   - **Type**: `string`
   - **Default**: `undefined`

The following options can be configured at **query time**
 - **lessThan** 
   - **Description**: *Value that the result should be less than*
   - **Type**: `number`
   - **Default**: `undefined`
 - **greaterThan** 
   - **Description**: *Value that the result should be greater than.*
   - **Type**: `number`
   - **Default**: `undefined`

--- 

## Custom Clusters

Developers can create their own clusters that can be plugged into Jhaystack, although it requires a bit of insight into the internal data structure. Check out these interfaces for how to create your own cluster class:

```javascript
/** Meta data about the index */
interface IIndexStatistics {
	numberOfDocuments: number
	numberOfTokens: number
	averageDocumentLength: number
}

/** Position of a token */
interface ITokenizerResultPositions {
	field: string
	offsetStart: number
	offsetEnd: number
	position: number
}

/** Information about a token */
interface IIndexTokenMeta {
	positions: ITokenizerResultPositions[]
	magnitude: number
}

/** Unique identifier for documents */
type DocumentID = number

/** An internal Jhaystack document */
interface Document {
	/** Unique Identifier */
	id: DocumentID
	/** The origin object */
	origin: any
	/** The index of the origin object in the origin array */
	originIndex: number
	/** All values found nested inside of the origin object, extracted using the extraction strategy */
	declarations: Declaration[]
}

/** A declared value inside of a document */
interface Declaration {
	/** The value */
	value: any
	/** The original (unprocessed) value */
	originValue: any
	/** The path inside of the Item object used to find the value */
	path: (string | number)[]
	/** The last non-numeric property in the path - I.e. any potential array index removed */
	key: string | null
	/** The score multiplier of the declaration */
	weight: number
	/** The normalized multiplier of the declaration */
	normalizedWeight: number
}

/** An indexed document. Note that token map and vector will be empty if an index has not been built */
interface IIndexDocument {
	document: Document
	tokenMap: Map<string, IIndexTokenMeta>
	vector: number[]
}

/** This is the cluster class you need to implement */
interface ICluster {
    //id property must be set in constructor, and be publically accessible
	id: string
	build: (documents: IIndexDocument[], statistics: IIndexStatistics) => void
	evaluate: (document?: IIndexDocument, options?: any) => DocumentID[]
}

/** And the constructor looks like this */
type IClusterConstructor new <T extends ICluster>(id: any, options: any): T
```