package cmd

import (
	"fmt"

	"github.com/anthemworld/cli/pkg/db"
	"github.com/spf13/cobra"
)

var jobsCmd = &cobra.Command{
	Use:   "jobs",
	Short: "Job management commands",
	Long:  `Commands for viewing and managing background jobs.`,
}

var jobsStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show jobs status",
	Long:  `Display status of running and recent jobs.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("--- Jobs Status ---")
		
		database, err := db.GetDB()
		if err != nil {
			return fmt.Errorf("failed to get database: %w", err)
		}
		defer database.Close()
		
		runningJobs, err := db.GetRunningJobs(database)
		if err != nil {
			return fmt.Errorf("failed to get running jobs: %w", err)
		}
		
		if len(runningJobs) > 0 {
			fmt.Println("Status: RUNNING")
			fmt.Printf("\n%d active job(s):\n", len(runningJobs))
			for _, job := range runningJobs {
				fmt.Printf("  - %s [%s] started at %s\n", job.ID, job.Type, job.StartedAt)
			}
		} else {
			fmt.Println("Status: IDLE")
			
			lastJob, err := db.GetLastCompletedJob(database)
			if err == nil && lastJob != nil {
				fmt.Println("\nLast completed job:")
				fmt.Printf("  ID: %s\n", lastJob.ID)
				fmt.Printf("  Type: %s\n", lastJob.Type)
				fmt.Printf("  Status: %s\n", lastJob.Status)
				fmt.Printf("  Started: %s\n", lastJob.StartedAt)
				if lastJob.CompletedAt != nil {
					fmt.Printf("  Completed: %s\n", *lastJob.CompletedAt)
				}
				if lastJob.ErrorMessage != nil {
					fmt.Printf("  Error: %s\n", *lastJob.ErrorMessage)
				}
			} else {
				fmt.Println("\nNo jobs have been run yet.")
			}
		}
		
		return nil
	},
}

func init() {
	rootCmd.AddCommand(jobsCmd)
	jobsCmd.AddCommand(jobsStatusCmd)
}
