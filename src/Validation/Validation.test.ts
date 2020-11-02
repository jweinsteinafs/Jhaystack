import { pathValidator } from "./Validation"

describe("Validation Module", () => {
	const includedPaths = [/\.?A$/, /\.?B$/, /\.?C$/]

	const excludedPaths = [/\.?A$/, /\.?B$/, /\.?C$/]

	it("Validates paths", () => {
		const path = ["A"]
		const wildPath = ["G"]
		const resultIncluded = pathValidator(path, includedPaths, [])
		const resultNotIncluded = pathValidator(wildPath, includedPaths, [])
		const resultExcluded = pathValidator(path, [], excludedPaths)
		const resultWildCard = pathValidator(path, [], [])
		expect(resultIncluded).toBe(true)
		expect(resultNotIncluded).toBe(false)
		expect(resultExcluded).toBe(false)
		expect(resultWildCard).toBe(true)
	})

	it("Converts provided path string to regex", () => {
		const includedPaths = ["hello"]
		const path = ["hello", "0"]
		const resultIncluded = pathValidator(path, includedPaths, [])
		expect(resultIncluded).toBe(true)
	})
})
