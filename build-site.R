#!/usr/bin/env Rscript

# Build the RMarkdown site for OHDSI Working Group Activities.
# Renders every .Rmd in rmd/ to HTML in docs/ and copies assets/ and data/activity.json along.

if (!requireNamespace("rmarkdown", quietly = TRUE)) {
  stop("Package 'rmarkdown' is required but not installed.\n",
       "Install it with: install.packages('rmarkdown')")
}

setwd("rmd")

cat("Building OHDSI WG Activities site...\n")
rmarkdown::render_site(encoding = "UTF-8")

cat("\nSite built successfully!\n")
cat("Output directory: docs/\n")
cat("To view locally: python3 -m http.server -d docs (the page loads data/activity.json, so open it over http)\n")
