// This file gets loaded into Fauxbar's background page.

// Initialise the file system
window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;

window.requestFileSystem(window.PERSISTENT, 50*1024*1024, function(fs){
	fs.root.getDirectory('thumbs', {create:true}, function(dirEntry) {}, fileErrorHandler);
}, fileErrorHandler);

// Record if we should restart the Helper next time it's disabled
chrome.management.onDisabled.addListener(function(extension) {
	if (window.doEnable == true && extension.name == "Fauxbar Memory Helper") {
		var eId = extension.id;
		setTimeout(function(){
			chrome.management.setEnabled(eId, true, function(){
				window.doEnable = false;
			});
		}, 100);
	}
});
// Reload Fauxbar Memory Helper if it's running
chrome.management.getAll(function(extensions){
	for (var e in extensions) {
		if (extensions[e].name == "Fauxbar Memory Helper" && extensions[e].enabled == true) {
			window.doEnable = true;
			var eId = extensions[e].id;
			setTimeout(function(){
				chrome.management.setEnabled(eId, false);
			}, 100);
		}
	}
});

// If Helper detects computer is idle, Fauxbar will report back to restart Fauxbar IF no Fauxbar tabs are open.
chrome.extension.onRequestExternal.addListener(function(request){
	if (request == "restart fauxbar?" && localStorage.indexComplete == 1) {
		console.log("Memory Helper would like to restart Fauxbar.");
		chrome.windows.getAll({populate:true}, function(windows){
			var okayToRestart = true;
			for (var w in windows) {
				for (var t in windows[w].tabs) {
					if (windows[w].tabs[t].title == "Fauxbar" || windows[w].tabs[t].title == "Fauxbar: Options" || windows[w].tabs[t].title == "Fauxbar: Edit Tiles" || windows[w].tabs[t].title == "Fauxbar: Error Log") {
						okayToRestart = false;
					}
				}
			}
			if (okayToRestart == true) {
				chrome.management.getAll(function(extensions){
					for (var e in extensions) {
						if (extensions[e].name == "Fauxbar Memory Helper" && extensions[e].enabled == true) {
							chrome.extension.sendRequest(extensions[e].id, "restart fauxbar");
						}
					}
				});
			}
		});
	}
});

$(document).ready(function(){

	// New version info
	var currentVersion = "1.0.0";
	localStorage.updateBlurb = " and is now available to the public. Thank you for your support throughout the beta test!";
	if ((!localStorage.currentVersion && localStorage.indexComplete && localStorage.indexComplete == 1) || (localStorage.currentVersion && localStorage.currentVersion != currentVersion) || (localStorage.readUpdateMessage && localStorage.readUpdateMessage == 0)) {
		localStorage.readUpdateMessage = 0;
	}

	// Switch to tab toggleable functionality. Added in 0.5.2
	if (!localStorage.option_switchToTab) {
		localStorage.option_switchToTab = "replace";
	}

	// Prompt user to confirm before deleting a history result via Quick Delete. Added in 0.5.2
	if (!localStorage.option_quickdelete_confirm) {
		localStorage.option_quickdelete_confirm = 1;
	}

	// Add keyword suggestions/queries options, added in 0.4.0
	if (!localStorage.option_showQueriesViaKeyword) {
		localStorage.option_showQueriesViaKeyword = 1;
		localStorage.option_showSuggestionsViaKeyword = 1;
	}
	// Change default unvisited bookmark frecency score to 1. Changed in 0.4.0 (and adding support for this to change in 0.4.1)
	if (!localStorage.currentVersion || (currentVersion == "0.4.0" && localStorage.currentVersion != "0.4.0") || (currentVersion == "0.4.1" && localStorage.currentVersion != "0.4.1")) {
		if (localStorage.option_frecency_unvisitedbookmark == 140) {
			localStorage.option_frecency_unvisitedbookmark = 1;
		}
	}

	// Set current version
	localStorage.currentVersion = currentVersion;

	// Ensure manual site tile URLs are marked accordingly in the `thumbs` table  (this fix/check was added in 0.2.2)
	if (localStorage.siteTiles && openDb()) {
		window.db.transaction(function(tx){
			var siteTiles = jQuery.parseJSON(localStorage.siteTiles);
			if (siteTiles.length > 0) {
				tx.executeSql('UPDATE thumbs SET manual = 0');
				for (var st in siteTiles) {
					if (siteTiles[st].url) {
						tx.executeSql('UPDATE thumbs SET manual = 1 WHERE url = ?', [siteTiles[st].url]);
					}
				}
			}
		}, function(t){
			errorHandler(t, getLineInfo());
		});
	}

	// Initialise the blacklist. Added in 0.3.0
	if (!localStorage.option_blacklist) {
		localStorage.option_blacklist = '';
	}

	// Enable pre-rendering. Added in 0.3.0
	if (!localStorage.option_prerender) {
		localStorage.option_prerender = 1;
	}
	if (!localStorage.option_prerenderMs) {
		localStorage.option_prerenderMs = 50;
	}

	// Consolidate duplicate bookmarks. Added in 0.2.0
	if (!localStorage.option_consolidateBookmarks) {
		localStorage.option_consolidateBookmarks = 1;
	}
	// Unread error count
	if (!localStorage.option_showErrorCount) {
		localStorage.option_showErrorCount = 1;
	}


	// Default tile arrangement. Added in v0.1.0
	if (!localStorage.option_pagetilearrangement) {
		localStorage.option_pagetilearrangement = "frecency";
	}

	if (openDb()) {

		// Vacuum the DB upon start, to help keep it speedy. Added in 0.5.0
		window.db.transaction(function(tx){
			tx.executeSql('VACUUM');
		});

		// Add `inputurls` table, added in 0.5.4
		window.db.transaction(function(tx){
			tx.executeSql('CREATE TABLE IF NOT EXISTS inputurls (input TEXT, url TEXT)');
			tx.executeSql('CREATE INDEX IF NOT EXISTS inputindex ON inputurls (input)');
			tx.executeSql('CREATE INDEX IF NOT EXISTS urlindex ON inputurls (url)');
		});

		// Add `tag` table, added in 0.5.0
		window.db.transaction(function(tx){
			tx.executeSql('CREATE TABLE IF NOT EXISTS tags (url TEXT DEFAULT "", tag TEXT DEFAULT "")');
			tx.executeSql('CREATE INDEX IF NOT EXISTS tagurlindex ON tags (url)');
			tx.executeSql('CREATE INDEX IF NOT EXISTS tagtagindex ON tags (tag)');
		});

		// Add `tag` column to `urls`, added in 0.5.0
		window.db.transaction(function(tx){
			tx.executeSql('ALTER TABLE urls ADD COLUMN tag TEXT DEFAULT ""');
			tx.executeSql('CREATE INDEX IF NOT EXISTS tagindex ON urls (tag)');
		});

		// Add `keyword` columns to `opensearches`, and apply keywords to the big three. Added in 0.4.0
		window.db.transaction(function(tx){
			tx.executeSql('ALTER TABLE opensearches ADD COLUMN keyword TEXT DEFAULT ""');
			tx.executeSql('UPDATE opensearches SET keyword = "g" WHERE shortname = "Google"');
			tx.executeSql('UPDATE opensearches SET keyword = "y" WHERE shortname = "Yahoo!"');
			tx.executeSql('UPDATE opensearches SET keyword = "b" WHERE shortname = "Bing"');
		});

		// Create `errors` table for error tracking. Added in 0.2.0
		window.db.transaction(function(tx){
			tx.executeSql('CREATE TABLE IF NOT EXISTS errors (id INTEGER PRIMARY KEY, date NUMERIC, version TEXT, url TEXT, file TEXT, line NUMERIC, message TEXT, count NUMERIC)');
		});

		// Add "manual" column to "thumbs". Added in v0.1.0
		window.db.transaction(function(tx){
			tx.executeSql('ALTER TABLE thumbs ADD COLUMN manual NUMERIC DEFAULT 0');
		});

		// Add frecency index to thumbs. Added in v0.0.7
		window.db.transaction(function(tx){
			tx.executeSql('CREATE INDEX IF NOT EXISTS frecencyindex ON thumbs (frecency)');
		}, function(t){
			errorHandler(t, getLineInfo());
		});

		// Delete top sites (eg top tiles) that have fallen below the frecency threshold
		window.db.transaction(function(tx){
			tx.executeSql('SELECT frecency FROM urls WHERE type = 1 ORDER BY frecency DESC LIMIT 50,50', [], function(tx, results){
				if (results.rows.length > 0) {
					window.frecencyThreshold = results.rows.item(0).frecency;
				} else {
					window.frecencyThreshold = 75;
				}
				tx.executeSql('SELECT url FROM thumbs WHERE frecency < ? AND manual != 1', [window.frecencyThreshold], function(tx, results2){
					var len = results2.rows.length, i;
					if (len > 0) {
						window.thumbsToDelete = new Array();
						for (var i = 0; i < len; i++) {
							window.thumbsToDelete[window.thumbsToDelete.length] = results2.rows.item(i).url;
						}
					}
				});
				tx.executeSql('DELETE FROM thumbs WHERE frecency < ? AND manual != 1', [window.frecencyThreshold]);
			});
		}, null, function(){
			if (window.thumbsToDelete) {
				var deleteThumb = function(url) {
					window.requestFileSystem(window.PERSISTENT, 50*1024*1024, function(fs) {
						fs.root.getFile('/thumbs/'+hex_md5(url)+".png", {create:false}, function(fileEntry) {
							fileEntry.remove();
						});
					});
					if (window.thumbsToDelete.length) {
						deleteThumb(window.thumbsToDelete.pop());
					} else {
						delete window.thumbsToDelete;
					}
				};
				deleteThumb(window.thumbsToDelete.pop());
			}
		});
	}
});

window.frecencyThreshold = 0;

// If Fauxbar is being started for the first time, load in the default options.
// os* usually stands for OpenSearch
if (!localStorage.firstrundone || localStorage.firstrundone != 1) {
	localStorage.indexComplete = 0;
	localStorage.indexedbefore = 0;
	localStorage.osshortname = 'Google';
	localStorage.osiconsrc = 'google.ico';
	localStorage.sapps = 1;
	localStorage.showintro = 1;
	resetOptions();
	localStorage.firstrundone = 1;
}

// Open a Fauxbar tab if the indexing needs to be done
if (localStorage.indexComplete != 1) {
	chrome.tabs.create({}, function(){
		// User probably disabled/re-enabled Fauxbar during an indexing session, so start indexing again
		if (localStorage.indexedbefore == 1) {
			clearIndex();
		}
	});

// Otherwise update top 50 sites with fresh frecency scores if top scores are older than 2 hours
} else {
	$(document).ready(function(){
		if (!localStorage.lastTopUrlRefresh || getMs() - localStorage.lastTopUrlRefresh > 7200000) {
			updateTopSites();
		}
	});
}

// Update top sites (one at a time) with fresh frecency scores
function updateTopSites() {
	if (openDb()) {
		window.db.readTransaction(function(tx){
			tx.executeSql('SELECT url FROM urls WHERE type = 1 ORDER BY frecency DESC LIMIT 50', [], function(tx, results){
				var len = results.rows.length, i;
				if (len > 0) {
					window.topUrls = new Array;
					var url = '';
					for (var i = 0; i < len; i++) {
						window.topUrls[window.topUrls.length] = results.rows.item(i).url;
					}
					updateTopUrl();
				}
			});
		}, function(t){
			errorHandler(t, getLineInfo());
		});
	}
}

// Calculate and apply frecency scores for each top URL
function updateTopUrl() {
	if (window.topUrls.length > 0) {
		var url = window.topUrls.pop();
		chrome.history.getVisits({url:url}, function(visits){
			visits.reverse();
			window.db.transaction(function(tx){
				var frec = calculateFrecency(visits);
				tx.executeSql('UPDATE urls SET frecency = ? where url = ?', [frec, url]);
				tx.executeSql('UPDATE thumbs SET frecency = ? where url = ?', [frec, url]);
			}, function(t){
				errorHandler(t, getLineInfo());
			}, function(){
				setTimeout(updateTopUrl, 200);
			});
		});
	} else {
		localStorage.lastTopUrlRefresh = getMs();
	}
}

// Update top site scores every 2 hours, in case user doesn't close Chrome at all
setInterval(updateTopSites, 7200000);

// Omnibox stuff! //

// When user starts using Fauxbar from the Omnibox, record the current tabs and set the default suggestion
chrome.omnibox.onInputStarted.addListener(function() {
	chrome.tabs.getAllInWindow(null, function(tabs){
		window.currentTabs = tabs;
	});
	chrome.omnibox.setDefaultSuggestion({description:"Open Fauxbar"});
});
chrome.omnibox.setDefaultSuggestion({description:"Open Fauxbar"});

// When user types something into Omnibox+Fauxbar, get some results and display them...
chrome.omnibox.onInputChanged.addListener(function(text, suggest){
	var origText = text;
	window.currentOmniboxText = text;
	if (text.length > 0 ) {
		chrome.omnibox.setDefaultSuggestion({description:"<dim>Fauxbar: %s</dim>"});
	} else {
		chrome.omnibox.setDefaultSuggestion({description:"Open Fauxbar"});
	}
	chrome.tabs.getAllInWindow(null, function(tabs){
		window.currentTabs = tabs;
	});
	var sortedHistoryItems = {};
	var resultObjects = [];
	if (openDb()) {
		window.db.readTransaction(function(tx) {
			// If there is user input, split it into words.
			if (text.length > 0) { // equivalent to "!noQuery" (see getResults() in fauxbar.js)
				var words = explode(" ", text);
				var urltitleWords = new Array();
				var urltitleQMarks1 = new Array();
				var urltitleQMarks2 = new Array();
				var modifiers = '';
				urltitleWords[urltitleWords.length] = text+"%";
				for (var w in words) {
					if (words[w] != "") {
						// If word is "is:fav", add it as a modifier to the SQL query statement
						if (words[w].toLowerCase() == 'is:fav') {
							modifiers += ' AND type = 2 ';
						}
						else {
							urltitleWords[urltitleWords.length] = '%'+str_replace("_","�_",str_replace("%","�%",words[w]))+'%';
							urltitleQMarks2[urltitleQMarks2.length] = ' urltitletag LIKE ? ESCAPE "�" ';
						}
					}
				}
			}

			if (text.length == 0 || urltitleWords.length > 0 || modifiers != "") {

				// Show history items and/or bookmarks depending on user's settings
				var typeOptions = ['type = -1'];
				if (localStorage.option_showmatchinghistoryitems && localStorage.option_showmatchinghistoryitems == 1) {
					typeOptions[typeOptions.length] = ' type = 1 ';
				}
				if (localStorage.option_showmatchingfavs && localStorage.option_showmatchingfavs == 1) {
					typeOptions[typeOptions.length] = ' type = 2 ';
				}
				typeOptions = implode(" OR ", typeOptions);

				var resultLimit = localStorage.option_maxaddressboxresults ? localStorage.option_maxaddressboxresults : 12;
				resultLimit = resultLimit * 2;
				if (resultLimit > 20) {
					resultLimit = 20;
				}

				// Ignore titleless results if user has opted. But still keep proper files like .pdf, .json, .js, .php, .html, etc. And also allow untitled URLs ending with "/"
				var titleless = localStorage.option_ignoretitleless == 1 ? ' AND (title != "" OR urls.url LIKE "%.__" OR urls.url LIKE "%.___" OR urls.url LIKE "%.____" OR urls.url LIKE "%/") ' : "";

				// If there's no input...
				if (text.length == 0) {
					var selectStatement = 'SELECT url, title, type, tag FROM urls WHERE ('+typeOptions+') AND queuedfordeletion = 0 '+titleless+' ORDER BY frecency DESC, type DESC LIMIT '+resultLimit;
				}
				// Else, If we have words...
				else if (urltitleWords.length > 0) {
					var selectStatement = ''
						+ ' SELECT urls.url, title, type, urls.tag, (urls.url||" "||title||" "||urls.tag) AS urltitletag, tags.url*0 as tagscore'
						+ ' FROM urls '
						+ ' LEFT JOIN tags '
						+ ' ON urls.url = tags.url AND tags.tag LIKE ? ' 																  //OR tags.tag LIKE ?
						+ ' WHERE ('+typeOptions+') AND queuedfordeletion = 0 '+modifiers+' '+(urltitleQMarks2.length ? ' AND '+implode(" AND ", urltitleQMarks2) : ' ')+' ' + titleless
						+ ' ORDER BY tagscore DESC, frecency DESC, type DESC LIMIT '+resultLimit;
				}
				// Else, this probably doesn't ever get used.
				else {
					var selectStatement = 'SELECT url, title, type, tag FROM urls WHERE ('+typeOptions+') AND queuedfordeletion = 0 '+modifiers + titleless+' ORDER BY frecency DESC, type DESC LIMIT '+resultLimit;
				}

				// If user text no longer equals the text we're processing, cancel.
				if (window.currentOmniboxText != origText) {
					return false;
				}

				// Execute the query...
				tx.executeSql(selectStatement, urltitleWords, function (tx, results) {
					var len = results.rows.length, i;
					var newItem = {};

					// Create each result as a new object
					for (var i = 0; i < len; i++) {
						newItem = {};
						newItem.url = results.rows.item(i).url;
						newItem.title = results.rows.item(i).title;
						newItem.tag = results.rows.item(i).tag;
						if (results.rows.item(i).type == 2) {
							newItem.isBookmark = true;
						}
						sortedHistoryItems[i] = newItem;
					}

					maxRows = resultLimit / 2;
					if (maxRows > 10) {
						maxRows = 10;
					}
					var currentRows = 0;
					var hI = "";
					var resultIsOkay = true;
					var titleText = "";
					var urlText = "";
					var tagText = "";
					var regEx = "";
					var divvy = "";
					var resultString = "";
					var urlExplode = "";

					// Replace any cedillas with a space - it's a special character. Sorry to anyone that actually uses it!
					text = str_replace("�", " ", text);

					var matchOpen = '<match>';
					var matchClose = '</match>';
					if (localStorage.option_bold == 0) {
						matchOpen = matchClose = '';
					}

					// Replace special characters with funky �%%%%%%� symbols
					text = replaceSpecialChars(text);
					var truncated = 0;

					if (localStorage.option_blacklist.length) {
						var blacksites = explode(",", localStorage.option_blacklist);
					} else {
						var blacksites = new Array;
					}

					// For each result...
					for (var i in sortedHistoryItems) {
						truncated = 0;
						if (currentRows < maxRows) {
							hI = sortedHistoryItems[i];
							resultIsOkay = true;

							// Sort words by longest length to shortest
							if (text.length > 0) {
								words = explode(" ", text);
								if (words) {
									words.sort(compareStringLengths);
								}
							}

							// Check to see if site is on the blacklist
							if (blacksites.length) {
								for (var b in blacksites) {
									var bs = blacksites[b].trim();
									var blackparts = explode("*",bs);
									var partsMatched = 0;
									for (var p in blackparts) {
										if (strstr(hI.url, blackparts[p])) {
											partsMatched++;
										}
									}
									if (partsMatched == blackparts.length) {
										resultIsOkay = false;
										break;
									}
								}
							}

							if (resultIsOkay == true) {

								// If result is titleless, make the title be the URL
								if (hI.title == "") {
									urlExplode = explode("/", hI.url);
									titleText = urldecode(urlExplode[urlExplode.length-1]);
									if (titleText.length == 0) {
										titleText = urldecode(hI.url);
									}
								} else {
									titleText = hI.title;
								}
								urlText = urldecode(hI.url);

								// Remove "http://" from the beginning of the URL
								if (urlText.substring(0,7) == 'http://' && localStorage.option_hidehttp && localStorage.option_hidehttp == 1) {
									urlText = urlText.substr(7);
									if (substr_count(urlText, '/') == 1 && urlText.substr(urlText.length-1) == '/') {
										urlText = urlText.substr(0, urlText.length-1);
									}
								}

								// Truncate the URL a bit
								if (localStorage.option_omniboxurltruncate && urlText.length > localStorage.option_omniboxurltruncate && (urlText+titleText).length > localStorage.option_omniboxurltruncate*2) {
									truncated = 1;
									urlText = urlText.substring(0,localStorage.option_omniboxurltruncate);
								}

								tagText = hI.tag;

								// Replace special characters with funky �%%%%%%� symbols
								titleText = replaceSpecialChars(titleText);
								urlText = replaceSpecialChars(urlText);
								tagText = replaceSpecialChars(tagText);

								// Wrap each word with more funky symbols
								for (var i in words) {
									if (words[i] != "") {
										regEx = new RegExp(words[i], 'gi');
										titleText = titleText.replace(regEx, '�%%%%%�$&�%%%%�');
										urlText = urlText.replace(regEx, '�%%%%%�$&�%%%%�');
										tagText = tagText.replace(regEx, '�%%%%%�$&�%%%%�');
									}
								}

								// Replace the previous symbols with their original characters; this was to let all characters work with RegExp
								titleText = replacePercents(titleText);
								urlText = replacePercents(urlText);
								tagText = replacePercents(tagText);

								// Replace <match> and </match> with symbols
								titleText = str_replace("�%%%%%�", matchOpen, titleText);
								titleText = str_replace("�%%%%�", matchClose, titleText);
								urlText = str_replace("�%%%%%�", matchOpen, urlText);
								urlText = str_replace("�%%%%�", matchClose, urlText);
								tagText = str_replace("�%%%%%�", matchOpen, tagText);
								tagText = str_replace("�%%%%�", matchClose, tagText);

								// Replace &
								titleText = str_replace('&', '&amp;', titleText);
								urlText = str_replace('&', '&amp;', urlText);
								tagText = str_replace('&', '&amp;', tagText);

								// Replace symbols back to <match> and </match>
								titleText = str_replace(matchOpen, "�%%%%%�", titleText);
								titleText = str_replace(matchClose, "�%%%%�", titleText);
								urlText = str_replace(matchOpen, "�%%%%%�", urlText);
								urlText = str_replace(matchClose, "�%%%%�", urlText);
								tagText = str_replace(matchOpen, "�%%%%%�", tagText);
								tagText = str_replace(matchClose, "�%%%%�", tagText);

								// Replace opening and closing tags
								titleText = str_replace(">", "&gt;", titleText);
								titleText = str_replace("<", "&lt;", titleText);

								urlText = str_replace(">", "&gt;", urlText);
								urlText = str_replace("<", "&lt;", urlText);

								tagText = str_replace(">", "&gt;", tagText);
								tagText = str_replace("<", "&lt;", tagText);

								titleText = str_replace("�%%%%%�", matchOpen, titleText);
								titleText = str_replace("�%%%%�", matchClose, titleText);
								urlText = str_replace("�%%%%%�", matchOpen, urlText);
								urlText = str_replace("�%%%%�", matchClose, urlText);
								tagText = str_replace("�%%%%%�", matchOpen, tagText);
								tagText = str_replace("�%%%%�", matchClose, tagText);

								// Make URLs say "Switch to tab" if tab is open
								if (localStorage.option_switchToTab != "disable") {
									for (var ct in window.currentTabs) {
										if (currentTabs[ct].url == hI.url) {
											urlText = localStorage.option_switchToTab == "replace" ? 'Switch to tab' : '</url><dim>Switch to tab:</dim> <url>'+urlText;
										}
									}
								}

								if (resultIsOkay == true) {
									resultString = "";
									if (urlText.length > 0) {

										// Make a star symbol be the separator if result is a bookmark, otherwise just a dash
										divvy = hI.isBookmark ? '&#9733;' : '-';

										// If URL is truncated, add ...
										if (truncated == 1) {
											urlText += '...';
										}
										resultString += "<url>"+urlText+"</url> <dim>"+divvy+"</dim> "+titleText;
									} else {
										if (hI.isBookmark) {
											resultString += '<dim>&#9733;</dim> ';
										}
										resultString += titleText;
									}

									if (tagText != null && tagText.length) {
										resultString += ' <dim>- '+tagText+'</dim>';
									}

									resultObjects[resultObjects.length] = {content:hI.url, description:resultString};
									currentRows++;
								}
							}
						}
					}
					// Give the results to Chrome to display
					suggest(resultObjects);
				});
			}
		}, function(t){
			errorHandler(t, getLineInfo());
		});
	}
});

// When user selects which Omnibox+Fauxbar result to go to...
chrome.omnibox.onInputEntered.addListener(function(text){
	var url = text.trim();
	if (url.length == 0) {
		url = chrome.extension.getURL("fauxbar.html");
	}

	// Switch to tab if needed
	if (localStorage.option_switchToTab != "disable") {
		for (var t in window.currentTabs) {
			if (window.currentTabs[t].url == url) {
				chrome.tabs.update(window.currentTabs[t].id, {selected:true});
				return false;
			}
		}
	}

	// Decide if URL is valid or not
	var urlIsValid = false;
	if (substr_count(url, " ") == 0) {
		var testUrl = url.toLowerCase();
		if (testUrl.substr(0,7) != 'http://' && testUrl.substr(0,8) != 'https://' && testUrl.substr(0,6) != 'ftp://' && testUrl.substr(0,8) != 'file:///' && testUrl.substr(0,9) != 'chrome://' && testUrl.substr(0,6) != 'about:' && testUrl.substr(0,12) != 'view-source:' && testUrl.substr(0,17) != 'chrome-extension:' && testUrl.substr(0,5) != 'data:') {
			if (substr_count(url, ".") == 0) {
				// it's a search!
			} else {
				url = 'http://'+url;
				urlIsValid = true;
			}
		} else {
			urlIsValid = true;
		}
	}

	// Do a search with Fallback URL if it's not a valid URL
	if (!urlIsValid) {
		if (localStorage.option_fallbacksearchurl && localStorage.option_fallbacksearchurl.length && strstr(localStorage.option_fallbacksearchurl, "{searchTerms}")) {
			url = str_replace("{searchTerms}", urlencode(url), localStorage.option_fallbacksearchurl);
		} else {
			url = 'http://www.google.com/search?btnI=&q='+urlencode(url);
		}
	}

	// Make the tab go to the URL (or Fallback URL)
	chrome.tabs.getSelected(null, function(tab){
		chrome.tabs.update(tab.id, {url:url, selected:true});
	});
});

// Tell Fauxbar to refresh any Address Bar results.
// Used when a tab opens, closes or changes.
// Refreshing is basically so that "Switch to tab" text can be shown or displayed as needed.
function refreshResults() {
	if (localStorage.option_switchToTab != "disable") {
		chrome.extension.sendRequest({message:"refreshResults"});
	}
}

// Starts the indexing procress.
function beginIndexing() {
	window.reindexing = true;
	localStorage.indexComplete = 0;
	console.log("Indexing has begun.");
	reindex();
}

// Capture tab screenshot and save it
function captureScreenshot(sender) {
	if (openDb()) {
		window.db.transaction(function(tx){

			// Check to see if page is a top site
			tx.executeSql('SELECT frecency FROM urls WHERE url = ? LIMIT 1', [sender.tab.url], function(tx, results){

				// Check to see if URL is a user-chosen site tile
				var urlIsManualTile = false;
				if (localStorage.option_pagetilearrangement == "manual" && localStorage.siteTiles) {
					var siteTiles = jQuery.parseJSON(localStorage.siteTiles);
					for (var st in siteTiles) {
						if (siteTiles[st].url == sender.tab.url) {
							urlIsManualTile = true;
							break;
						}
					}
				}
				if (results.rows.length > 0 || urlIsManualTile == true) {
					if (results.rows.length > 0) {
						var frecency = results.rows.item(0).frecency;
					} else {
						var frecency = -1;
					}
					if (frecency >= window.frecencyThreshold || urlIsManualTile == true) {
						chrome.tabs.getSelected(null, function(selectedTab){
							if (selectedTab.id == sender.tab.id) {

								// Take a screenshot and save the image
								chrome.tabs.captureVisibleTab(null, {format:"png"}, function(dataUrl){
									if (dataUrl != "") {
										var myCanvas = document.createElement("canvas");
										var context = myCanvas.getContext('2d');
										var img = new Image;
										img.onload = function(){
											var width = 430; // Double width than the actual displayed tile size, so that it gets shrunk and looks nice.
											var height = Math.round(img.height * width / img.width);
											myCanvas.width = width;
											myCanvas.height = height > 268 ? 268 : height;
											context.drawImage(img,0,0, width, height);

											// Save image data

											window.requestFileSystem(window.PERSISTENT, 50*1024*1024, function(fs){
												fs.root.getFile('/thumbs/'+hex_md5(sender.tab.url)+'.png', {create:true}, function(fileEntry) {
													fileEntry.createWriter(function(fileWriter) {
														fileWriter.write(dataURItoBlob(myCanvas.toDataURL("image/png")));
													}, fileErrorHandler);
												}, fileErrorHandler);
											}, fileErrorHandler);

											window.db.transaction(function(tx){
												tx.executeSql('UPDATE thumbs SET title = ?, frecency = ? WHERE url = ?', [sender.tab.title, frecency, sender.tab.url], function(tx, results){
													if (results.rowsAffected == 0) {
														tx.executeSql('INSERT INTO thumbs (url, title, frecency) VALUES (?, ?, ?)', [sender.tab.url, sender.tab.title, frecency]);
													}
												});
											}, function(t){
												errorHandler(t, getLineInfo());
											});
										};
										img.src = dataUrl;
									}
								});
							}
						});
					}
				}
			});
		}, function(t){
			errorHandler(t, getLineInfo());
		});
	}
}

// Background page listens for requests...
chrome.extension.onRequest.addListener(function(request, sender){

	// Generate top site tile thumbnail for page if page reports page has not been scrolled at all
	if (request == "scrolltop is 0") {
		captureScreenshot(sender);
	}

	// Record what the user typed to go to a URL, to help out the pre-rendering guesswork
	else if (request.action && request.action == "record input url") {
		if (localStorage.option_prerender == 1 && openDb()) {
			window.db.transaction(function(tx){
				tx.executeSql('DELETE FROM inputurls WHERE input = ?', [request.input.toLowerCase()]);
				tx.executeSql('INSERT INTO inputurls (input, url) VALUES (?, ?)', [request.input.toLowerCase(), request.url]);
			}, function(t){
				errorHandler(t, getLineInfo());
			});
		}
	}

	// Pre-rendered page is being navigated to, so let's process it in a moment
	else if (request == "process prerendered page") {

		// Tab ID changes with prerendering (even though it's the same tab...), so need to get new ID via getSelected()
		setTimeout(function(){
			chrome.tabs.getSelected(null, function(tab){
				processUpdatedTab(tab.id, tab);
				captureScreenshot(sender);
			});
		}, 500);
	}

	// Request received to do the indexing process
	else if (request.action && request.action == "reindex") {
		beginIndexing();
	}

	// Chrome sometimes truncates page titles for its history items. Don't know why.
	// So, have Fauxbar update it's own database with proper, updated current titles.
	else if (request.action && request.action == "updateUrlTitles") {
		if (openDb()) {
			window.db.transaction(function (tx) {
				tx.executeSql('UPDATE urls SET title = ? WHERE url = ? AND type = 1', [request.urltitle, request.url]);
				tx.executeSql('UPDATE thumbs SET title = ? WHERE url = ?', [request.urltitle, request.url]);
			}, function(t){
				errorHandler(t, getLineInfo());
			});
		}
	}

	// After user clicks the Page Action to add a new search engine to Fauxbar, this hides the Page Action.
	else if (request.action && request.action == 'waitingToClose') {
		window.lastClosureMessage = getMs();
		window.lastSenderTabId = request.tabid;
		setTimeout(function(){
			if (getMs() - window.lastClosureMessage > 75) {
				chrome.tabs.getAllInWindow(null, function(tabs){
					for (var t in tabs) {
						if (strstr(tabs[t].url, request.hostname)) {
							chrome.pageAction.hide(tabs[t].id);
							if (localStorage.option_forceoptionsicon && localStorage.option_forceoptionsicon == 1) {
								chrome.pageAction.setIcon({tabId:tabs[t].id, path:"fauxbar16options.png"});
								chrome.pageAction.setTitle({tabId:tabs[t].id, title:"Customize Fauxbar"});
								chrome.pageAction.setPopup({tabId:tabs[t].id, popup:""});
								chrome.pageAction.onClicked.addListener(function(theTab) {
									chrome.tabs.update(theTab.id, {url:"fauxbar.html#options=1"});
								});
								chrome.pageAction.show(tabs[t].id);
							}
						}
					}
				});
			}
		}, 100);
	}

	// Show the Page Action if the page has a search engine that can be added to Fauxbar.
	else if (request.action && request.action == "showPageAction") {
		if (openDb()) {
			if (request.xmlurl && request.xmlurl != '') {
				var myStatement = 'SELECT shortname FROM opensearches WHERE xmlurl = ?';
				var myArray = [request.xmlurl];
			}
			else if (request.improper && request.improper == true && request.actionAttr && request.actionAttr != '') {
				var myStatement = 'SELECT shortname FROM opensearches WHERE searchurl LIKE ?';
				var myArray = ['%'+request.hostname+'%'];
			}
			else {
				console.log('Fauxbar: Error processing PageAction.');
				return false;
			}

			window.db.readTransaction(function (tx) {
				tx.executeSql(myStatement, myArray, function (tx, results) {
					var len = results.rows.length, i;

					// If this site's search engine hasn't already been added to Fauxbar...
					if (len == 0) {
						chrome.pageAction.setIcon({tabId:sender.tab.id, path:"fauxbar16plus.png"});
						chrome.pageAction.setTitle({tabId:sender.tab.id, title:"Add this site's search engine to Fauxbar"});
						chrome.pageAction.setPopup({tabId:sender.tab.id, popup:"fauxbar.addsearchengine.html"});
						chrome.pageAction.show(sender.tab.id);
					}
				});
			}, function(t){
				errorHandler(t, getLineInfo());
			});
		}
	}
});

// Tabs! //

// When tab is removed or created, refresh any current Address Box results so they can show/hide any "Switch to tab" texts
chrome.tabs.onRemoved.addListener(function() {
	refreshResults();
});
chrome.tabs.onCreated.addListener(function() {
	refreshResults();
});

// When user changes tabs, send request if the tab has not been scrolled down, to see if the page should have a new top site tile thumbnail generated
chrome.tabs.onSelectionChanged.addListener(function(tabId, selectInfo){
	chrome.tabs.get(tabId, function(tab){
		if (tab && tab.url && (tab.url.substr(0,7) == 'http://' || tab.url.substr(0,8) == 'https://')) {
			if (tab.selected == true && tab.status == "complete") {
				chrome.tabs.executeScript(tab.id, {file:"getscrolltop.js"});
			}
		}
	});
});

function processUpdatedTab(tabId, tab) {
// Refresh results for "Switch to tab" texts
	if (tab.status == "complete") {
		refreshResults();
	}

	// If URL is a web page...
	if (tab.url.substr(0,7) == 'http://' || tab.url.substr(0,8) == 'https://') {

		// If user has opted to enable Alt+D, Ctrl+L or Ctrl+L functionality, make it so
		if ((localStorage.option_altd && localStorage.option_altd == 1) || (localStorage.option_ctrll && localStorage.option_ctrll == 1) || (localStorage.option_ctrlk && localStorage.option_ctrlk == 1)) {
			if (localStorage.option_altd && localStorage.option_altd == 1) {
				chrome.tabs.executeScript(tabId, {file:"alt-d.js"});
			}
			if (localStorage.option_ctrll && localStorage.option_ctrll == 1) {
				chrome.tabs.executeScript(tabId, {file:"ctrl-l.js"});
			}
			if (localStorage.option_ctrlk && localStorage.option_ctrlk == 1) {
				chrome.tabs.executeScript(tabId, {file:"ctrl-k.js"});
			}
		}

		// If user's opted to always show the Options icon, make it so
		if (localStorage.option_forceoptionsicon && localStorage.option_forceoptionsicon == 1) {
			chrome.pageAction.setIcon({tabId:tabId, path:"fauxbar16options.png"});
			chrome.pageAction.setTitle({tabId:tabId, title:"Customize Fauxbar"});
			chrome.pageAction.setPopup({tabId:tabId, popup:""});
			chrome.pageAction.onClicked.addListener(function(theTab) {
				chrome.tabs.update(theTab.id, {url:"fauxbar.html#options=1"});
			});
			chrome.pageAction.show(tabId);
		}

		// If user's opted to let Fauxbar look for new search engines to add, make it so
		if (localStorage.option_osproper && localStorage.option_osproper == 1) {
			chrome.tabs.executeScript(tabId, {file:"osproper.js"});
		}
		if (localStorage.option_osimproper && localStorage.option_osimproper == 1) {
			chrome.tabs.executeScript(tabId, {file:"osimproper.js"});
		}

		// Generate thumbnail if page is a top site
		if (tab.selected == true && tab.status == "complete") {
			chrome.tabs.executeScript(tab.id, {file:"getscrolltop.js"});
		}
	}
}


// When a tab changes its URL, or finishes loading the page...
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
	processUpdatedTab(tabId, tab);
});

// When tab moves to a new Window, refresh Address Box results "Switch to tab" texts
chrome.tabs.onDetached.addListener(function() {
	refreshResults();
});
chrome.tabs.onAttached.addListener(function() {
	refreshResults();
});

// History! //

// When Chrome adds a page visit to its history index, update Fauxbar's index with this information.
// note: Chrome adds a "visit" as soon as the page starts loading. But this happens before the <title> tag is read, and so visits sometimes aren't recorded with a title in Chrome's history the first time they're loaded.
chrome.history.onVisited.addListener(function(historyItem) {

	// If the visit is to Fauxbar's page, remove it from Chrome's history. Don't need to litter the user's history with every instance that Fauxbar is opened when they open a new tab.
	if (strstr(historyItem.url, chrome.extension.getURL(""))) {
		chrome.history.deleteUrl({url:historyItem.url});
	}

	// If the visit is a pure data source, like maybe viewing an inline image, don't add it to Fauxbar; it'll slow Fauxbar down too much. Plus it acts as a titleless result, which isn't very helpful.
	else if (historyItem.url.substr(0, 5) == 'data:') {
		return false;
	}

	// Otherwise, we want to add the visit to Fauxbar's database...
	else if (openDb()) {
		window.db.readTransaction(function (tx) {

			// See if it exists...
			tx.executeSql('SELECT url FROM urls WHERE url = ? AND type = 1 AND queuedfordeletion = 0', [historyItem.url], function(tx, results){
				var len = results.rows.length, i;

				// If URL doesn't exist in Fauxbar's database, add it
				if (len == 0) {
					chrome.history.getVisits({url:historyItem.url}, function(visitItems){
						visitItems.reverse();
						if (visitItems[0].transition != 'auto_subframe') {
							window.db.transaction(function (tx) {
								var frecency = calculateFrecency(visitItems);
								tx.executeSql('INSERT OR REPLACE INTO urls (url, type, title, frecency, queuedfordeletion) VALUES (?, ?, ?, ?, ?)', [historyItem.url, 1, historyItem.title, frecency, 0]);
								tx.executeSql('UPDATE urls SET frecency = ? WHERE url = ?', [frecency, historyItem.url]);
								tx.executeSql('UPDATE thumbs SET frecency = ? WHERE url = ?', [frecency, historyItem.url]);
							}, function(t){
								errorHandler(t, getLineInfo());
							}, reapplyKeywords);
						}
					});
				}

				// If URL *does* exist, update it with a new frecency score
				else {
					chrome.history.getVisits({url:historyItem.url}, function(visitItems){
						visitItems.reverse();
						window.db.transaction(function (tx) {
							var frecency = calculateFrecency(visitItems);
							tx.executeSql('UPDATE urls SET frecency = ? WHERE url = ?', [frecency, historyItem.url]);
							tx.executeSql('UPDATE thumbs SET frecency = ? WHERE url = ?', [frecency, historyItem.url]);
						}, function(t){
							errorHandler(t, getLineInfo());
						});
					});
				}
				tx.executeSql('SELECT frecency FROM urls WHERE type = 1 ORDER BY frecency DESC LIMIT 50,50', [], function(tx, results){
					if (results.rows.length > 0) {
						window.frecencyThreshold = results.rows.item(0).frecency;
					} else {
						window.frecencyThreshold = 75;
					}
				});
			});
		}, function(t){
			errorHandler(t, getLineInfo());
		});
	}
});

// When Chrome deletes its history...
// if ALL of Chrome's history has been removed, or if all visits of a unique URL have been removed, this function gets called.
// But this function does *not* get called if only a few visits of a URL get removed.
// eg, if you visit a URL every hour in a day, and then tell Chrome to delete your past hour of history, this function will not get called because visits of the URL still remain for the other 23 hours.
chrome.history.onVisitRemoved.addListener(function(removed) {
	if (openDb()) {

		// If user has chosen to remove their entire history from Chrome, do the same to Fauxbar's index
		if (removed.allHistory == true) {
			console.log("Removing all history URLs!");
			window.db.transaction(function(tx){
				tx.executeSql('DELETE FROM urls WHERE type = 1');
				tx.executeSql('UPDATE thumbs SET frecency = -1');
				tx.executeSql('UPDATE thumbs SET frecency = -2 WHERE manual != 1');
				tx.executeSql('UPDATE urls SET frecency = ? WHERE type = 2', [localStorage.option_frecency_unvisitedbookmark]);
				tx.executeSql('DELETE FROM inputurls');
			}, function(t){
				errorHandler(t, getLineInfo());
			});
		}

		// But if all visits of specific URLs have been removed, delete them from Fauxbar's index
		else {
			window.db.transaction(function (tx) {
				for (var r in removed.urls) {
					tx.executeSql('DELETE FROM urls WHERE type = 1 AND url = ?', [removed.urls[r]]);
					tx.executeSql('UPDATE thumbs SET frecency = -1 WHERE url = ?', [removed.urls[r]]);
					tx.executeSql('UPDATE thumbs SET frecency = -2 WHERE url = ? AND manual != 1', [removed.urls[r]]);
					tx.executeSql('UPDATE urls SET frecency = ? WHERE url = ? AND type = 2', [localStorage.option_frecency_unvisitedbookmark, removed.urls[r]]);
					tx.executeSql('DELETE FROM inputurls WHERE url = ?', [removed.urls[r]]);
				}
			}, function(t){
				errorHandler(t, getLineInfo());
			});
		}
	}
});

// Bookmarks! //

// If a Chrome bookmark gets edited, update the change in Fauxbar
chrome.bookmarks.onChanged.addListener(function(id, changeInfo){
	if (changeInfo.url && changeInfo.url.length > 0 && openDb()) {
		chrome.history.getVisits({url:changeInfo.url}, function(visits){
			visits.reverse();
			window.db.transaction(function(tx){
				tx.executeSql('UPDATE urls SET url = ?, title = ?, frecency = ? WHERE type = 2 AND id = ?', [changeInfo.url, changeInfo.title, localStorage.option_frecency_unvisitedbookmark, id]);
				var frec = calculateFrecency(visits);
				tx.executeSql('UPDATE urls SET frecency = ? WHERE url = ?', [frec, changeInfo.url]);
				tx.executeSql('UPDATE thumbs SET frecency = ? WHERE url = ?', [frec, changeInfo.url]);
			}, function(t){
				errorHandler(t, getLineInfo());
			});
		});
	}
});

// If bookmark is created, add it to Fauxbar
chrome.bookmarks.onCreated.addListener(function(id, bookmark){
	if (bookmark.url && bookmark.url.length > 0 && openDb()) {
		chrome.history.getVisits({url:bookmark.url}, function(visits){
			visits.reverse();
			window.db.transaction(function(tx){
				var frec = calculateFrecency(visits);
				tx.executeSql('INSERT INTO urls (url, title, type, id, frecency) VALUES (?, ?, ?, ?, ?)', [bookmark.url, bookmark.title, 2, bookmark.id, visits.length > 0 ? frec : localStorage.option_frecency_unvisitedbookmark]);
				if (visits.length > 0) {
					tx.executeSql('UPDATE urls SET frecency = ? WHERE url = ?', [frec, bookmark.url]);
					tx.executeSql('UPDATE thumbs SET frecency = ? WHERE url = ?', [frec, bookmark.url]);
				}
			}, function(t){
				errorHandler(t, getLineInfo());
			}, reapplyKeywords);
		});
	}
});

delete localStorage.reindexingBookmarks;

function reindexBookmarks(bookmarkTreeNode) {
	if (bookmarkTreeNode.url) {
		window.bookmarkNodesToReindex[window.bookmarkNodesToReindex.length] = bookmarkTreeNode;
		setTimeout(function(){
			var node = window.bookmarkNodesToReindex.pop();
			chrome.history.getVisits({url:node.url}, function(visitItems) {
				visitItems.reverse();
				window.db.transaction(function(tx){
					tx.executeSql('INSERT OR REPLACE INTO urls (url, type, title, frecency, id) VALUES (?, ?, ?, ?, ?)', [node.url, 2, node.title, calculateFrecency(visitItems), node.id]);
				}, function(t){
					errorHandler(t, getLineInfo());
				}, function(){
					window.lastBookmarkReindexTime = date("U");
					setTimeout(function(){
						if (date("U") - window.lastBookmarkReindexTime > 3) {
							chrome.extension.sendRequest("done reindexing bookmarks");
							delete localStorage.reindexingBookmarks;
						}
					}, 4000);
					reapplyKeywords();
				});
			});
		}, 100);
	}
	if (bookmarkTreeNode.children) {
		window.bookmarksToIndex = window.bookmarksToIndex + bookmarkTreeNode.children.length;
		for (var b in bookmarkTreeNode.children) {
			reindexBookmarks(bookmarkTreeNode.children[b]);
		}
	}
}

// If bookmark is removed, remove it from Fauxbar
chrome.bookmarks.onRemoved.addListener(function(id, removeInfo){
	if (openDb()) {
		window.db.transaction(function(tx){
			tx.executeSql('DELETE FROM urls WHERE id = ? AND type = 2', [id], function(tx, results){
				window.results = results;

				// If no rows get affected from this DELETE statement, it means a folder was deleted.
				// If a folder was deleted, Fauxbar has no idea what was inside, so need to re-index all bookmarks.
				// Might be better to keep proper track of bookmarks and folders...
				if (results.rowsAffected == 0) {
					tx.executeSql('DELETE FROM urls WHERE type = 2');
				}
			});
		}, errorHandler, function(){

			// If a folder was deleted, reindex all bookmarks.
			console.log('A bookmark or bookmark folder has been removed from Chrome.\nRows affected: '+window.results.rowsAffected);
			if (window.results.rowsAffected == 0) {
				window.bookmarkNodesToReindex = new Array;
				chrome.bookmarks.getTree(function(bookmarkTreeNodes){
					if (bookmarkTreeNodes.length) {
						localStorage.reindexingBookmarks = 1;
						chrome.extension.sendRequest("reindexing bookmarks");
						for (var b in bookmarkTreeNodes) {
							reindexBookmarks(bookmarkTreeNodes[b]);
						}
					}
				});
			}
		});
	}
});

chrome.management.onInstalled.addListener(function(app) {
	if (app.isApp) {
		localStorage.option_showapps = 1;
		localStorage.sapps = 2;
	}
});

// Check to see if the indexing finished
function isIndexingFinished() {
	if (window.sqlLastExecution && getMs() - window.sqlLastExecution > 1500 && window.doneApplyingFrecencyScores == 1) {
		$("#indexing").remove();
		window.stepsDone++;
		window.reindexing = false;
		localStorage.indexComplete = 1;
		localStorage.indexedbefore = 1;
		console.log("Indexing complete.");
		chrome.extension.sendRequest({message:"currentStatus",status:"Indexing complete.", step:8}); // Step 8
		localStorage.almostdone = 1;
		setTimeout(function(){
			alert("Success!\n\nFauxbar has finished indexing your history items and bookmarks, and is now ready for use.\n\nFrom here on, Fauxbar's index will be silently updated on-the-fly for you.");
			updateTopSites();
			reapplyKeywords();
			chrome.extension.sendRequest("DONE INDEXING");
		},1200);
		return true;
	}
	else {
		chrome.extension.sendRequest({message:"currentStatus",status:window.indexStatus});
		setTimeout(isIndexingFinished, 500);
	}
}

// Really start the indexing process
function startIndexing() {
	if (openDb(true)) {
		setTimeout(isIndexingFinished, 2000);
		window.indexStatus = "Processing your history items and bookmarks..."; // Step 4
		chrome.extension.sendRequest({message:"currentStatus",status:"Processing your history items and bookmarks...", step:4});
		chrome.history.search({text:"", startTime:1, maxResults:999999999}, function(historyItems){
			window.historyItemsToCopy = historyItems;
			var hi = "";
			window.db.transaction(function(tx){
				for (var h in window.historyItemsToCopy) {
					hi = window.historyItemsToCopy[h];
					tx.executeSql('INSERT INTO urls (url, type, title, frecency) VALUES (?, ?, ?, ?)', [hi.url, 1, hi.title, -1]);
					window.sqlLastExecution = getMs();
				}
				tx.executeSql('DELETE FROM urls WHERE url LIKE "data:%" OR url LIKE "javascript:void%"');
				window.indexStatus = "Processing your history items and bookmarks..."; // Step 5
				chrome.extension.sendRequest({message:"currentStatus",status:"Processing your history items and bookmarks...", step:5});
				chrome.bookmarks.getTree(function(bookmarkTreeNodes){
					for (var b in bookmarkTreeNodes) {
						indexBookmarks(bookmarkTreeNodes[b]);
					}
				});
				console.log("Total history items: "+window.historyItemsToCopy.length);

				window.frecencyStatements = new Array();
				chrome.extension.sendRequest({message:"currentStatus",status:"Calculating frecency scores for "+number_format(window.historyItemsToCopy.length)+" different URLs...", step:6}); // Step 6
				window.indexStatus = "Calculating frecency scores for "+number_format(window.historyItemsToCopy.length)+" different URLs...";
				window.historyItemsToCopyLength = window.historyItemsToCopy.length;
				assignFrecencies(true);
			}, function(t){
				errorHandler(t, getLineInfo());
			});
		});
	}
}

// Calculate and apply frecency scores for all the URLs
function assignFrecencies() {
	if (window.historyItemsToCopy.length > 0) {
		window.hi2 = window.historyItemsToCopy[window.historyItemsToCopy.length-1];
		chrome.history.getVisits({url:window.hi2.url}, function(visitItems){
			if (visitItems.length > 0 && visitItems[0]) {
				visitItems.reverse();
				var frecency = calculateFrecency(visitItems);
				window.frecencyStatements[window.frecencyStatements.length] = {statement:'UPDATE urls SET frecency = ? WHERE url = ?', inputs:[frecency, window.hi2.url]};
			}
			window.sqlLastExecution = getMs();
			window.historyItemsToCopy.pop();
			assignFrecencies();
		});
	}
	else {
		console.log("Executing frecency updates, please wait...");
		window.indexStatus = "Applying frecency scores to "+number_format(window.historyItemsToCopyLength)+" different URLs..."; // Step 7
		chrome.extension.sendRequest({message:"currentStatus",status:"Applying frecency scores to "+number_format(window.historyItemsToCopyLength)+" different URLs...", step:7});
		window.historyItemsToCopy = null;
		window.db.transaction(function(tx){
			for (var fs in window.frecencyStatements) {
				tx.executeSql(window.frecencyStatements[fs].statement, window.frecencyStatements[fs].inputs);
			}
			window.doneApplyingFrecencyScores = 1;
			delete window.frecencyStatements;
		}, function(t){
			errorHandler(t, getLineInfo());
		});
	}
}

// Current number of seconds since the epoch
function getMs() {
	var currentTime = new Date();
	return currentTime.getTime();
}

// Generate a frecency score number for a URL.
// Scoring derived from https://developer.mozilla.org/en/The_Places_frecency_algorithm
// Make sure visitItems has been .reverse()'d before calling this function
function calculateFrecency(visitItems) {
	var vi = '';
	var singleVisitPoints = 0;
	var summedVisitPoints = 0;
	var bonus = 0;
	var bucketWeight = 0;
	var days = 0;
	var frecency = -1;
	var x = 0;

	// If user has opted to use custom scoring...
	if (localStorage.option_customscoring == 1) {

		// For each sampled recent visits to this URL...
		for (x=0; x < Math.min(visitItems.length,localStorage.option_recentvisits); x++) {
			singleVisitPoints = 0;
			bonus = 0;
			bucketWeight = 0;
			days = 0;
			vi = visitItems[x];

			// Determine which bonus score to give
			switch (vi.transition) {
				case "link":
					bonus = localStorage.option_frecency_link;
					break;
				case "typed":
					bonus = localStorage.option_frecency_typed;
					break;
				case "auto_bookmark":
					bonus = localStorage.option_frecency_auto_bookmark;
					break;
				case "reload":
					bonus = localStorage.option_frecency_reload;
					break;
				case "start_page":
					bonus = localStorage.option_frecency_start_page;
					break;
				case "form_submit":
					bonus = localStorage.option_frecency_form_submit;
					break;
				case "keyword":
					bonus = localStorage.option_frecency_keyword;
					break;
				case "generated":
					bonus = localStorage.option_frecency_generated;
					break;
				default:
					break;
			}

			// Determine the weight of the score, based on the age of the visit
			days = Math.floor(Math.round(getMs() - vi.visitTime) / 86400);
			if (days < localStorage.option_cutoff1) {
				bucketWeight = localStorage.option_weight1;
			} else if (days < localStorage.option_cutoff2) {
				bucketWeight = localStorage.option_weight2;
			} else if (days < localStorage.option_cutoff3) {
				bucketWeight = localStorage.option_weight3;
			} else if (days < localStorage.option_cutoff4) {
				bucketWeight = localStorage.option_weight4;
			} else {
				bucketWeight = localStorage.option_weight5;
			}

			// Calculate the points
			singleVisitPoints = (bonus / 100) * bucketWeight;
			summedVisitPoints = summedVisitPoints + singleVisitPoints;
		}

	// Else, if user has not opted to use custom scoring, just use the defaults...
	} else {
		// For each sampled visit...
		for (x=0; x < Math.min(visitItems.length,10); x++) {
			singleVisitPoints = 0;
			bonus = 0;
			bucketWeight = 0;
			days = 0;
			vi = visitItems[x];

			// Assign bonus score based on visit type
			switch (vi.transition) {
				case "link":
					bonus = 100;
					break;
				case "typed":
					bonus = 100;
					break;
				case "auto_bookmark":
					bonus = 75;
					break;
				case "reload":
					bonus = 100;
					break;
				case "start_page":
					bonus = 100;
					break;
				case "form_submit":
					bonus = 100;
					break;
				case "keyword":
					bonus = 100;
					break;
				case "generated":
					bonus = 100;
					break;
				default:
					break;
			}

			// Assign weight based on visit's age
			days = Math.floor(Math.round(getMs() - vi.visitTime) / 86400);
			if (days < 4) {
				bucketWeight = 100;
			} else if (days < 14) {
				bucketWeight = 70;
			} else if (days < 31) {
				bucketWeight = 50;
			} else if (days < 90) {
				bucketWeight = 30;
			} else {
				bucketWeight = 10;
			}

			// Calculate points
			singleVisitPoints = (bonus / 100) * bucketWeight;
			summedVisitPoints = summedVisitPoints + singleVisitPoints;
		}
	}

	// Calculate the frecency score for the URL
	frecency = Math.ceil(visitItems.length * summedVisitPoints / x);
	return frecency;
}

// Add bookmarks to Fauxbar's database
function indexBookmarks(bookmarkTreeNode) {
	if (bookmarkTreeNode.url) {
		window.db.transaction(function(tx){
			tx.executeSql('INSERT OR REPLACE INTO urls (url, type, title, frecency, id) VALUES (?, ?, ?, ?, ?)', [bookmarkTreeNode.url, 2, bookmarkTreeNode.title, localStorage.option_frecency_unvisitedbookmark, bookmarkTreeNode.id]);
		}, function(t){
			errorHandler(t, getLineInfo());
		});
	}
	if (bookmarkTreeNode.children) {
		for (var b in bookmarkTreeNode.children) {
			indexBookmarks(bookmarkTreeNode.children[b]);
		}
	}
}

// Reset or create the database tables
function clearIndex(reindexing) {
	if (openDb(true)) {
		window.clearingIndex = true;
		window.db.transaction(function(tx){
			window.indexStatus = "Creating database tables..."; // Step 2
			chrome.extension.sendRequest({message:"currentStatus",status:"Creating database tables...", step:2}); // Step 2

			// Address Box history items and bookmarks
			tx.executeSql('DROP TABLE IF EXISTS urls');
			tx.executeSql('CREATE TABLE urls (url TEXT, type NUMERIC, title TEXT, frecency NUMERIC DEFAULT -1, queuedfordeletion NUMERIC DEFAULT 0, id NUMERIC DEFAULT 0, tag TEXT DEFAULT "")'); // type1 = history item, type2 = bookmark
			tx.executeSql('CREATE INDEX IF NOT EXISTS urlindex ON urls (url)');
			tx.executeSql('CREATE INDEX IF NOT EXISTS titleindex ON urls (title)');
			tx.executeSql('CREATE INDEX IF NOT EXISTS frecencyindex ON urls (frecency)');
			tx.executeSql('CREATE INDEX IF NOT EXISTS idindex ON urls (id)');
			tx.executeSql('CREATE INDEX IF NOT EXISTS typeindex ON urls (type)');
			tx.executeSql('CREATE INDEX IF NOT EXISTS tagindex ON urls (tag)');

			// Error log table
			tx.executeSql('CREATE TABLE IF NOT EXISTS errors (id INTEGER PRIMARY KEY, date NUMERIC, version TEXT, url TEXT, file TEXT, line NUMERIC, message TEXT, count NUMERIC)');

			// URL tag table
			tx.executeSql('CREATE TABLE IF NOT EXISTS tags (url TEXT DEFAULT "", tag TEXT DEFAULT "")');
			tx.executeSql('CREATE INDEX IF NOT EXISTS tagurlindex ON tags (url)');
			tx.executeSql('CREATE INDEX IF NOT EXISTS tagtagindex ON tags (tag)');

			// User input > url table, for helping out with the pre-rendering guesswork
			tx.executeSql('CREATE TABLE IF NOT EXISTS inputurls (input TEXT, url TEXT)');
			tx.executeSql('CREATE INDEX IF NOT EXISTS inputindex ON inputurls (input)');
			tx.executeSql('CREATE INDEX IF NOT EXISTS urlindex ON inputurls (url)');

			// If we're setting up the database for the first time, and not just reindexing...
			if (!localStorage.indexedbefore || localStorage.indexedbefore != 1) {

				// Site tile thumbnails
				tx.executeSql('DROP TABLE IF EXISTS thumbs');
				tx.executeSql('CREATE TABLE thumbs (url TEXT UNIQUE ON CONFLICT REPLACE, data BLOB, date INTEGER, title TEXT, frecency NUMERIC DEFAULT -1, manual NUMERIC DEFAULT 0)'); // "manual" meaning, is the thumb a user-defined site tile, not necessarily a top frecency scored one
				tx.executeSql('CREATE INDEX IF NOT EXISTS urlindex ON thumbs (url)');
				tx.executeSql('CREATE INDEX IF NOT EXISTS frecencyindex ON thumbs (frecency)');

				// Search Box search engines
				tx.executeSql('DROP TABLE IF EXISTS opensearches');
				tx.executeSql('CREATE TABLE opensearches (shortname TEXT UNIQUE ON CONFLICT REPLACE, iconurl TEXT, searchurl TEXT, xmlurl TEXT, xml TEXT, isdefault NUMERIC DEFAULT 0, method TEXT DEFAULT "get", position NUMERIC DEFAULT 0, suggestUrl TEXT, keyword TEXT DEFAULT "")');

				// Search Box search queries
				tx.executeSql('DROP TABLE IF EXISTS searchqueries');
				tx.executeSql('CREATE TABLE searchqueries (id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT)');
				tx.executeSql('CREATE INDEX IF NOT EXISTS queryindex ON searchqueries (query)');

				window.indexStatus = "Adding search engines..."; // Step 3
				chrome.extension.sendRequest({message:"currentStatus",status:"Adding search engines...", step:3}); // Step 3

				// Add Google, Yahoo! and Bing to the Search Box
				tx.executeSql('INSERT INTO opensearches (shortname, iconurl, searchurl, xmlurl, xml, isdefault, method, suggestUrl, keyword) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', ["Google", "google.ico", "http://www.google.com/search?q={searchTerms}", "", "", "1", "get", "http://suggestqueries.google.com/complete/search?json&q={searchTerms}", "g"]);
				tx.executeSql('INSERT INTO opensearches (shortname, iconurl, searchurl, xmlurl, xml, isdefault, method, suggestUrl, keyword) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', ["Yahoo!", "yahoo.ico", "http://search.yahoo.com/search?p={searchTerms}", "", "", "0", "get", "http://ff.search.yahoo.com/gossip?output=fxjson&amp;command={searchTerms}", "y"]);
				tx.executeSql('INSERT INTO opensearches (shortname, iconurl, searchurl, xmlurl, xml, isdefault, method, suggestUrl, keyword) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', ["Bing", "bing.ico", "http://www.bing.com/search?q={searchTerms}", "", "", "0", "get", "http://api.bing.com/osjson.aspx?query={searchTerms}", "b"]);
			} else {
				window.indexStatus = "Skipping search engines..."; // Step 3
				chrome.extension.sendRequest({message:"currentStatus",status:"Skipping search engines...", step:3}); // Step 3
			}
		}, function(t){
			errorHandler(t, getLineInfo());
		}, startIndexing);
	}
}

function reapplyKeywords() {
	if (openDb()) {
		window.db.transaction(function(tx){
			tx.executeSql('SELECT * FROM tags', [], function(tx, results) {
				var len = results.rows.length, i;
				if (len > 0) {
					for (var i = 0; i < len; i++) {
						tx.executeSql('UPDATE urls SET tag = ? WHERE url = ?', [results.rows.item(i).tag, results.rows.item(i).url], [], function(tx, results2){
							if (results2.rowsAffected == 0) {
								tx.executeSql('DELETE FROM tags WHERE tag = ? AND url = ?', [results.rows.item(i).tag, results.rows.item(i).url]);
							}
						});
					}
				}
			});
		}, function(t){
			errorHandler(t, getLineInfo());
		});
	}
}