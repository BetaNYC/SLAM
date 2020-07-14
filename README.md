# SLAM

SLA Mapper ([SLAM](https://slam.beta.nyc)) – is a tool that aggregates data that community boards often have to gather in order to review liquor license applications and sidewalk cafe applications. Displaying this information in a unified view saves community boards considerable time and resources.

## How to Contribute

- File an issue via this [repo's issue cue](https://github.com/BetaNYC/SLAM/issues).
- Request a feature via this [repo's issue cue](https://github.com/BetaNYC/SLAM/issues).
- Comment on issues.
- Write code to fix issues or to create new features. When contributing code, please be sure to:

  - Fork this repository, modify the code (changing only one thing at a time), and then issue a pull request for each change.
  - Follow the project's coding style (using K&R-style indentation and bracketing, commenting above each feature, and using snake case for variables).
  - Test your code locally before issuing a pull request.
  - Clearly state the purpose of your change in the description field for each commit.

## Architecture

SLAM is a landing page that displays a Carto basemap and markers for each row of four datasets stored in BetaNYC's Carto account (1) 311 complaints about a club/restaurant/bar since 2017, 2) active SLA licenses, 3) sidewalk cafe licenses, and 4) the location of restaurant inspections). It also displays polygons representing buildings DCP has classed as schools and churches. Clicking on a marker further queries the datasets stored in Carto for additional information about the complaint/license/inspection. Datasets in in Carto are regularly automatically synced with datasets stored in the NYC or the NYS Open Data Portals. Searching for a NYC location queries NYC Planning Labs' GeoSearch for the geo-coordinates that correspond to the entered address, and the map repositions to this location.

## Setup

In order to set things up, you'll need to copy .env.example to .env and add your [Carto](https://betanyc.carto.com/your_apps) and [GeoClient](https://developer.cityofnewyork.us/api/geoclient-api) API keys.

```bash
cp .env.example .env
```

Then you run to install node.js packages

```bash
npm install
```

You can either build by running `npm run build` or run live development environment by running `npm run dev`, then opening [localhost:5000](http://localhost:5000/) in your browser.

## Backend Services

### carto

Most of the data for SLAM is stored in BetaNYC's carto account.

- `liquor_authority_quarterly_list_of_active_licenses` / `sla_geo`
  - Dataset of all NYS active liquor licenses
  - [Published](https://data.ny.gov/Economic-Development/Liquor-Authority-Quarterly-List-of-Active-Licenses/hrvs-fxs2) by the State Liquor Authority on NYS's Open Data Portal
  - Data is updated in the Open Data Portal quarterly, geocoded with GBAT, and synced with BetaNYC's Carto account weekly.
- `nyc_open_restaurants_application_v2_6`
  - Dataset of self-certified responses for NYC [Open Restaurants](https://www1.nyc.gov/html/dot/html/pedestrians/openrestaurants.shtml)
  - [Published](http://nycopenrestaurants.info) by NYCDOT on an ArcGIS Dashboard and Service API Layer
  - Data is synced wtih BetaNYC's Carto account hourly.
- `open_restaurants_pre_filter_since_march`
  - Dataset of all NYC 311 complaints made about an Open Restaurants since March 2020
  - [Published](https://data.cityofnewyork.us/Social-Services/open_restaurants_pre_filter_since_march/sujq-j9cg) 
  - NYPD - Social Distancing' and 'Face Covering Violation', DCA - 'Sidewalk Cafe', and DOT - 'Outdoor Dining' Types and Descriptors.
  - Read more about 311 Complaints for Open Restaurants [here](https://portal.311.nyc.gov/article/?kanumber=KA-03321)
- `club_bar_restaurant_complaints_since_jan_1_2017`
  - Dataset of all NYC 311 complaints made about a club/restaurant/bar since 2019
  - [Published](https://data.cityofnewyork.us/Social-Services/Club-Bar-Restaurant-Complaints-Since-Jan-1-2017/ezmw-ux9w) as a BetaNYC-filtered view on NYC's Open Data Portal
  - Data is updated in the Open Data Portal daily and synced wtih BetaNYC's Carto account daily.
- `sidewalk_caf_licenses_and_applications`
  - Dataset of all current, pending, and expired sidewalk cafe licenses in NYC
  - [Published](https://data.cityofnewyork.us/Business/Sidewalk-Caf-Licenses-and-Applications/qcdj-rwhu/data) by the Department of Consumer Affairs on NYC's Open Data Portal
  - Data is updated in the Open Data Portal weekly and synced wtih BetaNYC's Carto account weekly.
- `dohmh_inspections`
  - Dataset of locations of NYC inspected restaurants
  - Health grades for a NYC restaurant can be found in the Department and Health and Mental Hygiene's [Restaurant Inspection Results](https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j/data) dataset, published on the City's Open Data Portal. This dataset is organized so that each row represents one violation raised during a restaurant's health inspection. The row also reports the date of the inspection and the resulting grade. If restaurants had more than one violation during the inspection, there will be multiple rows representing that particular inspection, each reporting different violations but all reporting the same grade. If a restaurant has had more than one inspection, there will be multiple rows representing the restaurant's violations and grades given on different inspection dates. When the page loads, however, we do not need to display all of this information. In fact, the dataset is so large that we can't display all of that information on the page load. We only need to display the location of a restaurant that has been inspected. Later a user can click on the restaurant to trigger a query to gather more information about the restaurant's inspection history.
  - The DOHMH inspection restults dataset does not include geo-coordinates - only a building number, street name, and zip code. To get the locations in a format where they can be displayed on a map, we need to download the dataset and use the City's [Batch GeoSupport](https://www1.nyc.gov/site/planning/data-maps/open-data/dwn-gde-home.page) software to get the geo-coordinates. Since the same restaurants are often listed many times in the DOHMH inspection results dataset, to reduce processing time, we first remove rows representing the same restaurant from the dataset using R or Excel. We configure the GeoSupport software to read the filtered dataset and return the restaurant's name, unique identifier, address, lat, and lon.
  - Data is downloaded from Socrata, geo-coded, and manually uplaoded to Carto weekly.
- `dohmh_new_york_city_restaurant_inspection_results`
  - Dataset of NYC restaurant inspection results
  - [Published](https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j/data) by the Department of Health and Mental Hyegine on NYC's Open Data Portal
  - Data is updated in the Open Data Portal weekly and synced with BetaNYC's Carto account weekly
  - This dataset is only referenced once a user clicks on a resturant on the map. The query reads the unique identifier for the clicked on restaurant and then queries the restaurant inspection results dataset to get the inspection, violation, and grade history for the restaurant.
- `bkmappluto`, `bxmappluto`, `mnmappluto`, `qnmappluto`, `simappluto`
  - Shapefile of all lots in NYC
  - [Published](https://www1.nyc.gov/site/planning/data-maps/open-data/dwn-pluto-mappluto.page) by the Department of City Planning on City Planning's Website
  - DCP updates the data bi-annually and needs to be manually replaced in Carto when updated
- `NYC Boundaries Map (Community and city council districts)`
  - From [Boundaries-Map](https://github.com/BetaNYC/Boundaries-Map)

### Carto.js v4

We use Carto.js to create and style map layers from data stored in the BetaNYC Carto account.

- [Source](https://libs.cartocdn.com/carto.js/v4.1.2/carto.min.js)
- [Documentation](https://carto.com/developers/carto-js/reference/)

### Leaflet.js

We use leaflet.js for additional JS-based mapping features such as re-centering the map to certain geographic coordinates on a location search.

- [Source](https://unpkg.com/leaflet@1.3.1/dist/leaflet.js)
- [Documentation](https://leafletjs.com/reference-1.3.2.html)

### Chart.js

We use Chart.js to display a pie chart depicting the breakdown of 311 complaints made about a particular club/bar/restaurant according to their descriptors and a line chart depicting the number of 311 complaints made per year at a particular club/bar/restaurant.

- [Source](https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.7.2/Chart.min.js)
- [Documentation](http://www.chartjs.org/docs/latest/)

### NYC Planning Labs' GeoSearch API

When users enter a text address into the location search field, the system queries GeoSearch for the lat/lon of that location. The map re-centers to this lat/lon.

- [Source](https://github.com/NYCPlanning/labs-geosearch-api)
- [Documentation](https://geosearch.planninglabs.nyc/docs)

### NYC Geoclient API

We use the City's Geoclient API to query for the Building Identification Number (BIN) of the address listed for that liquor license. Having the establishment's BIN, we can construct a URL to the Certificate of Occupancy of the building, hosted on the DOB's website.

- [Source](https://developer.cityofnewyork.us/api/geoclient-api)
- [Documentation](https://api.cityofnewyork.us/geoclient/v1/doc)

### Svelte

We use Svelte, a component framework to help manage the reactivity of the various libraries and components of the tool.

- [Source](https://svelte.dev/)
- [Documentation](https://github.com/sveltejs/svelte)

## Change Log

### SLAM v0.10e

- Refactor to use Svelte for better component, layers, and state management
- Added a github action to automate build to gh-pages branch
- Updates address search to use NYC Planning Labs' GeoSearch API
- Added days_hours_of_operation and method_of_operation to infobox
- Changes to panels for a more responsive tool
- [[21]](../../../../BetaNYC/SLAM/issues/21) Remove API Keys from Public Code using rollup.js
- [[26]](../../../../BetaNYC/SLAM/issues/26) Update Liquor License data (format changed)
- Fixes to DOHMN layer to use [ABCEatsRestaurants](https://a816-health.nyc.gov/ABCEatsRestaurants/#/Search/) that replaced [NYC Restaurant Inspection](http://a816-restaurantinspection.nyc.gov/)
- [[30]](../../../../BetaNYC/SLAM/issues/30) Added Community and city council districts

### SLAM v0.9e

- [[24]](../../../../BetaNYC/SLAM/issues/24) Upated SQL queries to match column names in SLA dataset
- [[28]](../../../../BetaNYC/SLAM/issues/28) Added point to map when searching for a specific address.

### SLAM v0.8e

- [[22]](../../../../BetaNYC/SLAM/issues/22) Display schools and churches as polygons on the map.

### SLAM v0.7e

- [[20]](../../../../BetaNYC/SLAM/issues/20) Set the scroll on both info-boxes to scroll on the div only.
- [[16]](../../../../BetaNYC/SLAM/issues/16) Added a BetaNYC logo and header information.
- [[11]](../../../../BetaNYC/SLAM/issues/11) Changed the bar chart for complaints by year to a line chart.

### SLAM v0.6e

- [[8]](../../../../BetaNYC/SLAM/issues/8) Added Link to Certificate of Occupancy for each Liquor License
- [[19]](../../../../BetaNYC/SLAM/issues/19) Added Instructions to the Main Info-box
- [[12]](../../../../BetaNYC/SLAM/issues/12), [[13]](../../../../BetaNYC/SLAM/issues/13) Restyled the Info-boxes
- [[18]](../../../../BetaNYC/SLAM/issues/18) Changed the basemap
- [[17]](../../../../BetaNYC/SLAM/issues/17) Style adjustments for mobile devices

### SLAM v0.5e

- [[4]](../../../../BetaNYC/SLAM/issues/4) Icon sizes now scale according to the zoom.
- [[1]](../../../../BetaNYC/SLAM/issues/1) The Main Infobox now includes a color-coded legend.
- Restaurants and liquor licenses that were overlapping are now stacking on top of each other.
- [[5]](../../../../BetaNYC/SLAM/issues/5) Added a close link on the info window, making it easier to use the webpage on a mobile phone.
- [[6]](../../../../BetaNYC/SLAM/issues/6) The previous version only filtered to On-Premise liquor licenses. The current version filters to SW, SB, SL, VL, RL, HL, CL, CT, EL, TL, CR, RW, HW, CW, TW, WC, EB, and MR, which were identified to us as licence class codes, community boards often review.
- [[3]](../../../../BetaNYC/SLAM/issues/3) A location search bar was added.

## Copyrights

Please see [license](https://github.com/BetaNYC/SLAM/blob/master/LICENSE) file for details.

- Non-code, Creative Commons Attribution 4.0
- Code, GNU General Public License

## Have Questions?

Contact [Lindsay Poirier](mailto:lindsay@beta.nyc) , [Zhi Keng He](mainto:zhi@beta.nyc), and [Noel Hidalgo](mailto:noel@beta.nyc).
