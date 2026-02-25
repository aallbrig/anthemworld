package cmd

import (
	"fmt"
	"runtime"
)

// These vars are injected at build time via -ldflags.
// Defaults make `go run` work without any flags set.
var (
	version   = "dev"
	gitCommit = "none"
	buildDate = "unknown"
)

// buildVersionString returns the full multi-line version output.
// Cobra sets rootCmd.Version to this string, and the template just prints it.
func buildVersionString() string {
	short := gitCommit
	if len(short) > 7 {
		short = short[:7]
	}
	return fmt.Sprintf("worldanthem %s (%s)\n  commit:  %s\n  built:   %s\n  go:      %s",
		version, short, gitCommit, buildDate, runtime.Version())
}
