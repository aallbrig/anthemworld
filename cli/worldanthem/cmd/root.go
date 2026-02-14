package cmd

import (
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "worldanthem",
	Short: "Anthem World CLI - Manage national anthem data",
	Long: `World Anthem CLI is a command-line tool for discovering, downloading,
and managing data about national anthems from around the world.

The CLI manages a SQLite database at ~/.local/share/anthemworld/data.db
containing information about 193 UN-recognized countries and their anthems.`,
}

func Execute() error {
	return rootCmd.Execute()
}

func init() {
	rootCmd.CompletionOptions.DisableDefaultCmd = true
}
