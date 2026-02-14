# Dev Journal
# 2026/02/14
Given I'm working on multiple projects, I'm going to keep a journal.
Goal: click on country within its country bounds and show the country.
Design: downloading the geojson data should happen through the CLI.
    The geojson data should be downloaded into my sqlite database.
    The "status" sub command uses "data status" sub command in it's own status output. The "data sources status" command should be used in "data status", allowing for a recursive status command.
Chore: "data format --output ./tmp" will ensure the directory structure exists before writing to .json files.
Design: each data source should have its own sqlite schema defined when it extracts data from the data source.
Design: Ideally this data is associated to a job ID in an idiomatic normalized sql way.
Architecture: These design notes denote a feature of letting data sources define their own data schema and extraction logic,
    since each data source may be interacted with in a different way.
Design: The jobs system (CLI) should let me see insight into the data download process.
