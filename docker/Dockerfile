# Builds the site (rmd/ -> docs/) without installing R or pandoc locally.
# Debian's r-base with its packaged rmarkdown and pandoc: works on Apple silicon and amd64.
FROM r-base:latest

RUN apt-get update \
 && apt-get install -y --no-install-recommends pandoc r-cran-rmarkdown \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /site
CMD ["Rscript", "build-site.R"]
