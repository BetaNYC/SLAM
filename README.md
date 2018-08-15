# SLAM
SLA Mapper (SLAM) – is a tool that aggregates data that community boards often have to gather in order to review liquor license applications and sidewalk cafe applications. Displaying this information in a unified view saves community boards considerable time and resources.

## File an Issue 
We're tracking all issues via this [repo's issue cue](https://github.com/BetaNYC/SLAM/issues).

## Architecture
SLAM is a landing page that displays a Carto basemap and markers for each row of four datasets stored in BetaNYC's Carto account (1) 311 complaints about a club/restaurant/bar since 2017, 2) active SLA licenses, 3) sidewalk cafe licenses, and 4) the location of restaurant inspections). Clicking on a marker further queries the datasets stored in Carto for additional information about the complaint/license/inspection. Searching for a NYC location queries the City's GeoClient API for the geo-coordinates that correspond to the entered address, and the map repositions to this location. 

## Backend Services
### Carto.js v4
* [Source](https://libs.cartocdn.com/carto.js/v4.1.2/carto.min.js)
* [Documentation](https://carto.com/developers/carto-js/reference/)

### Leaflet.js 
* [Source](https://unpkg.com/leaflet@1.3.1/dist/leaflet.js)
* [Documentation](https://leafletjs.com/reference-1.3.2.html)

### Chart.js
* [Source](https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.7.2/Chart.min.js)
* [Documentation](http://www.chartjs.org/docs/latest/)

### NYC Geoclient API
* [Source](https://developer.cityofnewyork.us/api/geoclient-api)
* [Documentation](https://api.cityofnewyork.us/geoclient/v1/doc)

### carto
Most of the data for SLAM is stored in BetaNYC's carto account.
* `liquor_authority_quarterly_list_of_active_licenses`
** Dataset of all NYS active liquor licenses
** [Published](https://data.ny.gov/Economic-Development/Liquor-Authority-Quarterly-List-of-Active-Licenses/hrvs-fxs2) by the State Liquor Authority on NYS's Open Data Portal 
** Data is updated in the Open Data Portal quarterly and synced with BetaNYC's Carto account monthly.
* `club_bar_restaurant_complaints_since_jan_1_2017`
** Dataset of all NYC 311 complaints made about a club/restaurant/bar since 2017
** [Published](https://data.cityofnewyork.us/Social-Services/Club-Bar-Restaurant-Complaints-Since-Jan-1-2017/ezmw-ux9w) as a BetaNYC-filtered view on NYC's Open Data Portal 
** Data is updated daily and synced wtih BetaNYC's Carto account daily. 
* `sidewalk_caf_licenses_and_applications`
** Dataset of all current, pending, and expired sidewalk cafe licenses in NYC
** [Published](https://data.cityofnewyork.us/Business/Sidewalk-Caf-Licenses-and-Applications/qcdj-rwhu/data) by the Department of Consumer Affairs on NYC's Open Data Portal 
** Data is updated weekly and synced wtih BetaNYC's Carto account weekly. 


# Change Log

## SLAM v0.7e
* [[20]](../../../../BetaNYC/SLAM/issues/20) Set the scroll on both info-boxes to scroll on the div only. 
* [[16]](../../../../BetaNYC/SLAM/issues/16) Added a BetaNYC logo and header information.
* [[11]](../../../../BetaNYC/SLAM/issues/11) Changed the bar chart for complaints by year to a line chart. 

## SLAM v0.6e
* [[8]](../../../../BetaNYC/SLAM/issues/8) Added Link to Certificate of Occupancy for each Liquor License
* [[19]](../../../../BetaNYC/SLAM/issues/19) Added Instructions to the Main Info-box
* [[12]](../../../../BetaNYC/SLAM/issues/12), [[13]](../../../../BetaNYC/SLAM/issues/13) Restyled the Info-boxes
* [[18]](../../../../BetaNYC/SLAM/issues/18) Changed the basemap 
* [[17]](../../../../BetaNYC/SLAM/issues/17) Style adjustments for mobile devices

## SLAM v0.5e
* [[4]](../../../../BetaNYC/SLAM/issues/4) Icon sizes now scale according to the zoom.
* [[1]](../../../../BetaNYC/SLAM/issues/1) The Main Infobox now includes a color-coded legend. 
* Restaurants and liquor licenses that were overlapping are now stacking on top of each other. 
* [[5]](../../../../BetaNYC/SLAM/issues/5) Added a close link on the info window, making it easier to use the webpage on a mobile phone. 
* [[6]](../../../../BetaNYC/SLAM/issues/6) The previous version only filtered to On-Premise liquor licenses. The current version filters to SW, SB, SL, VL, RL, HL, CL, CT, EL, TL, CR, RW, HW, CW, TW, WC, EB, and MR, which were identified to us as licence class codes, community boards often review. 
* [[3]](../../../../BetaNYC/SLAM/issues/3) A location search bar was added. 

## Copyrights 

Please see [license](https://github.com/BetaNYC/SLAM/blob/master/LICENSE) file for details.
 * Non-code, Creative Commons Attribution 4.0
 * Code, GNU General Public License
