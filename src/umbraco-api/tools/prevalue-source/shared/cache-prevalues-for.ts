/**
 * The format of `FieldPreValueSource.cachePrevaluesFor`: a .NET `TimeSpan`
 * string, `[-][d.]hh:mm:ss[.fffffff]`.
 *
 * Umbraco 18's spec carries this as a `pattern`, from which Orval generates
 * `*CachePrevaluesForRegExp`. Umbraco 17's Swashbuckle spec only says
 * `format: date-span`, so on this line nothing is generated and the pattern
 * lives here. It is the same expression Umbraco 18 publishes.
 */
export const CACHE_PREVALUES_FOR_REGEX = /^-?(\d+\.)?\d{2}:\d{2}:\d{2}(\.\d{1,7})?$/;
