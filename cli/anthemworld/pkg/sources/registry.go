package sources

// AllSources contains all registered data sources
var AllSources = []DataSource{
	NewGeoJSONSource(),
	NewRestCountriesSource(),
	NewWikidataSource(),
	NewWikimediaSource(),
	NewFactbookSource(),
}

// GetSourceByID retrieves a data source by its ID
func GetSourceByID(id string) DataSource {
	for _, source := range AllSources {
		if source.ID() == id {
			return source
		}
	}
	return nil
}
