define(["lib-build/tpl!./MainMediaContainerMap",
		"lib-build/tpl!./MainMediaContainerImage",
		"lib-build/tpl!./MainMediaContainerEmbed",
		"lib-build/css!./MainStage",
		"../core/WebApplicationData",
		"dojo/has",
		"esri/arcgis/utils",
		"esri/renderers/UniqueValueRenderer",
		"esri/geometry/Point",
		"esri/geometry/Extent",
		"esri/config",
		"esri/geometry/webMercatorUtils",
		"esri/symbols/SimpleMarkerSymbol",
		//"esri/dijit/PopupMobile",
		"esri/tasks/QueryTask",
		"esri/tasks/query",
		"dojo/topic",
		"dojo/on",
		"dojo/aspect",
		"dojo/_base/lang"
	], 
	function(
		mainMediaContainerMapTpl,
		mainMediaContainerImageTpl,
		mainMediaContainerEmbedTpl,
		viewCss,
		WebApplicationData,
		has,
		arcgisUtils,
		UniqueValueRenderer,
		Point,
		Extent,
		esriConfig,
		webMercatorUtils,
		SimpleMarkerSymbol,
		//PopupMobile,
		QueryTask,
		Query,
		topic,
		on,
		aspect,
		lang
	){
		return function MainStage(container, isInBuilder, mainView)
		{
			var _this = this;
			
			//
			// Media containers
			//
			
			function addTemporaryMainMediaContainer(webmap)
			{
				$("#mainStagePanel .medias").append(mainMediaContainerMapTpl({ webmapid: webmap, isTemporary: true }));
			}
			
			this.updateMainMediaContainers = function()
			{
				var webmaps = app.data.getWebmaps(),
					images = app.data.getImages(),
					embeds = app.data.getEmbeds();
				
				//
				// Map
				//
				
				// Add new container
				$.each(webmaps, function(i, webmap){
					var mapContainer = $('.mapContainer[data-webmapid="' + webmap + '"]');
					if ( ! mapContainer.length )
						$("#mainStagePanel .medias").append( mainMediaContainerMapTpl({ webmapid: webmap, isTemporary: false }) );
				});
				
				// Remove unused container
				$('.mapContainer').each(function(){
					if ( $.inArray($(this).data('webmapid'), webmaps) == -1 )
						$(this).parent().remove();
				});
				
				//
				// Image
				//
				
				// Add new container
				$.each(images, function(i, imageUrl){
					var imageContainer = $('.imgContainer[data-src="' + imageUrl + '"]');
					if ( ! imageContainer.length )
						$("#mainStagePanel .medias").append( mainMediaContainerImageTpl({ url: imageUrl }) );
				});
				
				// Remove unused containers
				$('.imgContainer').each(function(){
					if ( $.inArray($(this).data('src'), images) == -1 )
						$(this).parent().remove();
				});
				
				//
				// Embed (video and webpage)
				//
				
				// Add new container
				$.each(embeds, function(i, embedInfo) {
					// TODO this has to be reviewed to not allow content to be loaded too early? or give the same option for url?
					var embedContainer = $('.embedContainer[data-src="' + (embedInfo.url || embedInfo.ts) + '"]');
					if ( ! embedContainer.length ) {
						
						//
						// Frametag are added straight to the dom without any container
						//  a class and a data attribute are added below
						// Ideally there should be a container so that it's possible to do more funny stuff like adding
						//  multiple iframe but these makes it difficult to center the frame(s)
						//
						
						$("#mainStagePanel .medias").append(mainMediaContainerEmbedTpl({ 
							url: embedInfo.url,
							frameTag: embedInfo.frameTag,
							// Introduced in V1.1
							unload: !!(embedInfo.unload === undefined || embedInfo.unload)
						}));
						
						// If it's a frame tag
						if ( !! embedInfo.frameTag ) {
							// Find the Iframe
							var frameTag = $("#mainStagePanel .medias .mainMediaContainer").last().find('iframe').first();
							
							// Transform the src attribute into a data-src and Add the timestamp
							frameTag.addClass('embedContainer')
								.attr('data-src', frameTag.attr('src'))
								.removeAttr('src')
								.attr('data-ts', embedInfo.ts)
								// Introduced in V1.1
								.attr('data-unload', !!(embedInfo.unload === undefined || embedInfo.unload));
						}
					}
				});
				
				// Remove unused containers
				$('.embedContainer').each(function() {
					var embedSRC = $(this).data('ts') || $(this).data('src');
					var embedInUse = $.grep(embeds, function(embed){
						return embedSRC == embed.url || embedSRC == embed.ts;
					}).length > 0;
					
					if ( ! embedInUse )
						$(this).parent().remove();
				});
				
				setMapControlsColor();
			};
			
			//
			// Management of Main Stage: all media
			//
			
			this.updateMainMediaWithStoryMainMedia = function(index)
			{
				var section = app.data.getStoryByIndex(index);
				if ( section && section.media )
					updateMainMedia(section.media, section, index);
			};
			
			this.updateMainMediaWithStoryAction = function(media)
			{
				updateMainMedia(media, app.data.getCurrentSection(), null);
			};
			
			function updateMainMedia(media, section, index)
			{
				// Refresh any iframe that would be the current Main Stage Media
				// If it's a video player this will stop current video playback 
				var activeFrame = $(".mainMediaContainer.active > iframe[data-unload=true]");
				if ( activeFrame.length ) {
					setTimeout(function(){
						activeFrame.attr('src', activeFrame.attr('src'));
					}, 500);
				}
				
				// Fade out active container
				$(".mainMediaContainer.active").fadeOut();
				// Stop loading Indicator if running
				// From now only the Map has a loading indicator
				stopMainStageLoadingIndicator();
				
				if ( media.type == "webmap" )
					updateMainMediaMaps(media.webmap.id, section, index, media);
				else if ( media.type == "image" )
					updateMainMediaPicture(media.image.url, media.image.display);
				else if ( media.type == "video" )
					updateMainMediaEmbed(media.video.url, media.video);
				else if ( media.type == "webpage" )
					updateMainMediaEmbed(media.webpage.url || media.webpage.ts, media.webpage);
			}
			
			function startMainStageLoadingIndicator()
			{
				$('#mainStageLoadingIndicator').fadeIn();
			}
			
			function stopMainStageLoadingIndicator()
			{
				$('#mainStageLoadingIndicator').fadeOut();
			}
			
			//
			// Layout
			//
			
			this.updateMainStageWithLayoutSettings = function()
			{
				var appLayout = WebApplicationData.getLayoutId(),
					appColors = app.data.getWebAppData().getColors(),
					layoutCfg = WebApplicationData.getLayoutCfg(),
					bodyWidth = $("body").width();
				
				// Resize embed that are have display fit
				styleMainStageEmbed();
				
				container.css("background-color", appColors.media);
				
				setMapControlsColor();
				
				if ( appLayout == "float" ) {
					var mapWidth = $("#contentPanel").width(),
						panelPos = $("#floatingPanel").position(),
						panelWidth = $("#floatingPanel").width(),
						isLeft = layoutCfg.position == "left",
						mapArea = isLeft ? mapWidth - (panelPos.left + panelWidth) : panelPos.left;
					
					// Attribution
					if ( isLeft )
						$(".mainMediaContainer.active .esriControlsBR").css({
							left: panelPos.left + panelWidth + 5,
							right: 'inherit'
						});
					else
						$(".mainMediaContainer.active .esriControlsBR").css({
							left: 'inherit',
							right: mapWidth - panelPos.left + 5
						});
					
					// Map configuration, loading indicator and error
					if ( isLeft )
						$(".mapConfigOverlay.position, .mapConfigOverlay.popup, #mainStageLoadingIndicator, .mainStageErrorContainer").css("left", panelPos.left + panelWidth + mapArea / 2);
					else
						$(".mapConfigOverlay.position, .mapConfigOverlay.popup, #mainStageLoadingIndicator, .mainStageErrorContainer").css("left", mapArea / 2);
					
					if ( $("body").hasClass("mobile-view") )
						$("#mainStageLoadingIndicator, .mainStageErrorContainer").css("left", "50%");
					
					//
					// Center some components on the Main Stage space at the left or right of the panel
					//
					
					var panelIsRight =  $("body").hasClass("layout-float-right"),
						paddingDir = panelIsRight ? "padding-right" : "padding-left",
						posDir = panelIsRight ? "right" : "left", 
						val = $("#floatingPanel").position().left;
					
					if ( panelIsRight )
						val = bodyWidth - val;
					else
						val += $("#floatingPanel").width(); 
					
					// Help, builder landing&quotes
					$(".centerAlignOnFloat")
						.css({ paddingRight: 0, paddingLeft: 0 })
						.css(paddingDir, val);
					
					// Back button
					$(".mediaBackContainer")
						.css({ left: 'inherit', right: 'inherit' })
						.css(posDir, val + mapArea / 2);
					
					// Help goes over the floating panel when screen too small 
					if ( bodyWidth <= 1067 )
						$("#builderHelp").css(paddingDir, 0);
					
					// Main Stage Images that are centered
					$(".mainMediaContainer .imgContainer.center")
						.css({ left: 0, right: 0 })
						.css(posDir, val);
					
					// Main Stage video&embed that are centered
					$(".mainMediaContainer .embedContainer.center")
						.css({ left: 0, right: 0 })
						.css(posDir, val);
					
					// Main Stage video&embed that are custom
					$(".mainMediaContainer .embedContainer.custom")
						.css({ left: 0, right: 0 })
						.css(posDir, val);
				}
				// Side Panel
				else {
					// Attribution
					$(".mainMediaContainer.active .esriControlsBR").css({
						left: "",
						right: ""
					});
					
					// Map configuration, loading indicator and error
					$(".mapConfigOverlay.position, .mapConfigOverlay.popup, #mainStageLoadingIndicator, .mainStageErrorContainer").css("left", "50%");
					
					// Reset centering that may have been done if user has changed layouts
					$(".centerAlignOnFloat").css({ paddingRight: 0, paddingLeft: 0 });
					$(".mediaBackContainer").css({ left: '50%', right: 'inherit' });
					$(".mainMediaContainer .imgContainer.center").css({ left: 0, right: 0 });
					$(".mainMediaContainer .embedContainer.center").css({ left: 0, right: 0 });
					$(".mainMediaContainer .embedContainer.custom").css({ left: 0, right: 0 });
				}
			};
			
			//
			// Management of Main Stage: map
			//
			
			// TODO params of the next two function has to be cleanedup
			
			function updateMainMediaMaps(newWebmapId, section, index, media) 
			{
				//var currentWebmapId = $('.mapContainer:visible').data('webmapid');
				
				var mapContainer = $('.mapContainer[data-webmapid="' + newWebmapId + '"]');
				$('.mainMediaContainer').removeClass("active has-error");
				mapContainer.parent().addClass("active");
				
				if ( newWebmapId ) {
					// The map has already been loaded
					if ( mapContainer.hasClass('map') ) {
						var extentBeforeUpdate = app.map ? app.map.extent : null;
						
						app.map = app.maps[newWebmapId].response.map;
						app.mapItem = app.maps[newWebmapId].response.itemInfo;
						app.mapConfig = app.maps[newWebmapId];
						
						updateMainMediaMapsStep2(
							mapContainer, 
							section, 
							extentBeforeUpdate, 
							index, 
							media,
							true
						);
					}
					// Need to load the map
					else {
						startMainStageLoadingIndicator();
						
						// Get the extent to be used to load the webmap
						var extent = media && media.webmap ? media.webmap.extent : null;
						if ( extent ) {
							try {
								extent = new Extent(extent);
							} catch (e) {
								extent = null;
							}
						}
						
						mainView.loadWebmap(newWebmapId, mapContainer[0], extent).then(
							lang.hitch(_this, function(response){
								var extentBeforeUpdate = app.map ? app.map.extent : null;
								
								app.maps[newWebmapId] = mainView.getMapConfig(response, mapContainer);
								app.map = response.map;
								app.mapItem = app.maps[newWebmapId].response.itemInfo;
								app.mapConfig = app.maps[newWebmapId];
								
								updateMainMediaMapsStep2(
									mapContainer, 
									section, 
									extentBeforeUpdate, 
									index, 
									media,
									false
								);
								
								//
								// Register events for the builder
								//  because we need to know for Map Configuration what is the intended extent 
								//  before the zoom when there is lods (the resulting extent will always be different)
								//
								if ( isInBuilder ) {
									// can't use update-end as it's not correct value for setExtent when lods
									app.ignoreNextEvent = false;
									aspect.before(app.map, "setExtent", function(extent) {
										console.log("Set extent:", extent);
										if ( ! app.ignoreNextEvent ) {
											app.lastExtentSet = extent;
											// A pan or zoom will also be triggered
											app.ignoreNextEvent = true;
										}
									});
									
									var handle = app.map.on("update-end", function(){
										handle.remove();
										app.lastExtentSet = app.map.extent;
										// store the initial extent in a new property 
										// TODO is that necessary? to not mess with browser resize and init map extent?
										//app.map._params.extent = app.map.extent;
										app.map.mapJournalInitExtent = app.map.extent;
										app.ignoreNextEvent = true;
									});
									
									var onPanOrZoomEnd = function(e)
									{
										if ( ! app.ignoreNextEvent )
											app.lastExtentSet = e.extent;
										else
											app.ignoreNextEvent = false;
									};
									app.map.on("zoom-end", onPanOrZoomEnd);
									app.map.on("pan-end", onPanOrZoomEnd);
								}
								
								// Popup
								if ( app.map.infoWindow ) {
									$(app.map.infoWindow.domNode).addClass("light");
									app.map.infoWindow.markerSymbol = new SimpleMarkerSymbol().setSize(0);
								}

								setTimeout(function(){
									stopMainStageLoadingIndicator();
								}, 50);
								
								mapContainer.parent().removeClass("has-error");
							}),
							lang.hitch(_this, function(){
								stopMainStageLoadingIndicator();
								mapContainer.parent().addClass("has-error");
								mapContainer.parent().find('.error').html(i18n.viewer.errors.mapLoadingFail);
								
								topic.publish("story-loaded-section", index);
								topic.publish("ADDEDIT_LOAD_WEBMAP_FAIL");
							})
						);
						
						// Publish an early loaded after two second in case the map is slow to load 
						setTimeout(function(){
							topic.publish("story-section-map-timeout");
						}, 2000);
					}
				} 
			}
			
			function updateMainMediaMapsStep2(mapContainer, section, oldExtent, index, media, notFirstLoad)
			{
				_this.updateMainStageWithLayoutSettings();
				setMapControlsColor();
				
				//app.data.debug();
				
				if( WebApplicationData.getLayoutId() == "float" )
					app.map.disableKeyboardNavigation();
				else
					app.map.enableKeyboardNavigation();
				
				try {
					app.map.resize();
					app.map.reposition();
				} catch(e) { }
				
				// If this is a story section
				if ( section || media ) {
					//
					// Layers
					//
					
					//  - Array of {id:'', visible:''} for the overrided layers (compared to the webmap initial state)
					//  - Only overrided layers are present there to allow the webmap to evolve outside of the app
					//     - If default visibility of layers are changed outside of the app, all view that didn't override the value will see the change
					//     - if the webmap evolve the array may reference deleted layers. That's cleaned anytime user open the Configure map View and Save
					var layerCfg = media && media.webmap ? media.webmap.layers : null,
						mapDefault = app.maps[media.webmap.id].response.itemInfo.itemData.operationalLayers;
					
					// Loop through webmap layers and set the visibility
					// The visibility is set to the section definition when defined or to the webmap initial visibility
					$.each(mapDefault, function(i, layer){
						var override;
						
						if ( layer.layerObject) {
							override = $(layerCfg).filter(function(i, l){ return l.id == layer.layerObject.id; });
							layer.layerObject.setVisibility(override.length ? override[0].visibility : layer.visibility);
						}
						else if ( layer.featureCollection && layer.featureCollection.layers ) {
							$.each(layer.featureCollection.layers, function(i, fcLayer){
								override = $(layerCfg).filter(function(i, l){ 
									// Because the configuration store the map layerObject id like "mapNotes_914_0" instead of "mapNotes_914"
									// Should change that and keep V1.0 compatibility
									return l.id.split('_').slice(0,-1).join('_') == fcLayer.layerObject.id.split('_').slice(0,-1).join('_'); 
								});
								fcLayer.layerObject.setVisibility(override.length ? override[0].visibility : fcLayer.visibility);
							});
						}
					});
					
					//
					// Extent
					//
					
					var extent = media && media.webmap ? media.webmap.extent : null;
					if ( extent ) {
						try {
							extent = new Extent(extent);
						} catch (e){
							//
						}
					}
					
					// Get back to the home section and section is configured to web map default
					if ( ! extent && notFirstLoad && index === 0 ) {
						extent = app.map._params.extent;
					}
					
					if ( extent )
						app.map.setExtent(extent/*, true*/).then(function(){
							applyPopupConfiguration(media.webmap.popup, index);
							topic.publish("story-loaded-section", index);
						}); // TODO has at least to use _core.setExtent
					else
						topic.publish("story-loaded-section", index);
					
					/*
					// Reuse the current extent
					else if( oldExtent )
						app.map.setExtent(oldExtent);
					*/
					
					//
					// Map Controls
					//
					
					var overviewSettings = media.webmap.overview || {},
						legendSettings = media.webmap.legend || {};
					
					// If it's a Main Stage Action, look to use the section Main Stage media 
					//  configuration IF it's a webmap 
					if ( index === null && section.media && section.media.webmap  ) {
						overviewSettings = section.media.webmap.overview || {},
						legendSettings = section.media.webmap.legend || {};
					}
					
					if ( overviewSettings.enable !== undefined ) {
						app.maps[media.webmap.id].overview.toggle(overviewSettings.enable, WebApplicationData.getColors());
						app.maps[media.webmap.id].overview.toggleExpanded(overviewSettings.openByDefault);
						app.maps[media.webmap.id].overview.setSettings(overviewSettings);
					}
					
					if ( legendSettings.enable !== undefined ) {
						app.maps[media.webmap.id].legend.toggle(legendSettings.enable);
						app.maps[media.webmap.id].legend.toggleExpanded(legendSettings.openByDefault);
						app.maps[media.webmap.id].legend.setSettings(legendSettings);
					}
					/*	*/
					//
					// Popup
					//
					
					if ( ! extent )
						applyPopupConfiguration(media.webmap.popup, index);
					// Otherwise called through extent change callback
					
				} 
				else 
					topic.publish("ADDEDIT_WEBMAP_DONE");
			}
			
			function applyPopupConfiguration(popupCfg, index)
			{
				// When an action is performed the popup will be closed
				// But features aren't cleared so it can be restored
				app.map.infoWindow.hide();
				
				if ( popupCfg ) {
					var layer = app.map.getLayer(popupCfg.layerId);
					
					app.map.infoWindow.clearFeatures();

					if ( layer ) 
						applyPopupConfigurationStep2(popupCfg, index);
					// On FS the layer will be null until loaded...
					else
						var handle = app.map.on("update-end", function(){
							applyPopupConfiguration(popupCfg, index);
							handle.remove();
						});
				}
			}

			function applyPopupConfigurationStep2(popupCfg, index)
			{
				var layer = app.map.getLayer(popupCfg.layerId);
				
				if ( ! layer )
					return;
				
				// Server layer
				if ( layer.url ) {
					var queryTask = new QueryTask(layer.url),
						query = new Query();
						query.objectIds = [popupCfg.fieldValue];
						query.returnGeometry = true;
						query.outFields = ["*"];
						query.outSpatialReference = app.map.spatialReference;

					queryTask.execute(query, function(result){
						var feature = result.features[0];
						if ( feature ) {
							if( ! feature.infoTemplate )
								feature.setInfoTemplate(layer.infoTemplate);
							
							// need to store the reference to the layer manually for the builder map popup configuration
							feature.MJlayerRef = layer;
							applyPopupConfigurationStep3(feature, index);
						}
					});
				}
				// Client side layer
				else {
					var feature = null;
					
					$.each(layer.graphics, function(i, g){
						if ( g.attributes[popupCfg.fieldName] == popupCfg.fieldValue )
							feature = g;
					});
					
					if ( feature )
						applyPopupConfigurationStep3(feature, index);
				}
			}
			
			function applyPopupConfigurationStep3(feature, index)
			{
				if ( ! feature )
					return;
				
				var geom = feature.geometry,
					center = geom.getExtent() ? geom.getExtent().getCenter() : geom;
				
				app.map.infoWindow.setFeatures([feature]);
				app.map.infoWindow.show(center);
				
				// Center the map is the geometry isn't visible
				if ( ! app.map.extent.contains(center) ) {
					app.map.centerAt(center);
					// Show back btn only if it's a Main Stage action
					if ( index === null ) {
						$('.mediaBackContainer')
							.show()
							.css("marginLeft", - $(".mediaBackContainer .backButton").outerWidth() / 2)
							.css("marginRight", - $(".mediaBackContainer .backButton").outerWidth() / 2);
					}
				}
			}
			
			function setMapControlsColor()
			{
				if ( app.mapConfig ) {
					var appColors = app.data.getWebAppData().getColors();
					app.mapConfig.overview.setColors(appColors);
					app.mapConfig.legend.setColors(appColors);
				}
			}
			
			// Builder events
			
			this.showWebmapById = function(webmapId)
			{
				updateMainMediaMaps(webmapId, null, null, null);
			};

			this.loadTmpWebmap = function(webmapId)
			{
				if ( ! $('.mapContainer[data-webmapid="' + webmapId + '"]').length )
					addTemporaryMainMediaContainer(webmapId);
				
				updateMainMediaMaps(webmapId, null, null, null);
			};
			
			//
			// Management of Main Stage: picture
			//
			
			function updateMainMediaPicture(url, display)
			{
				$('.mainMediaContainer').removeClass('active');
				var pictureContainer = $('.imgContainer[data-src="' + url + '"]');
				if ( pictureContainer ) {
					pictureContainer
						.removeClass("center fit fill stretch")
						.addClass(display)
						.css({
							left: 0,
							right: 0
						})
						.attr('src', pictureContainer.data('src'));
					
					_this.updateMainStageWithLayoutSettings();
					
					pictureContainer.parent().addClass('active');
				}
			}
			
			//
			// Management of Main Stage: embed (video and webpage) 
			//
			
			function updateMainMediaEmbed(url, cfg)
			{
				$('.mainMediaContainer').removeClass('active');
				
				// URL can be an URL or the timestamp in case of an iframe tag
				var embedContainer = $('.embedContainer[data-src="' + url + '"]');
				
				// Not found, must be an iframe tag
				if ( ! embedContainer.length ) {
					embedContainer = $('.embedContainer[data-ts="' + url + '"]');
					// The correct URL is in data-src
					url = embedContainer.data('src');
				}
				
				if ( embedContainer.length ) {
					embedContainer
						.removeClass("center fit fill stretch")
						.addClass(cfg.display)
						.attr("data-unload", cfg.unload === undefined || cfg.unload)
						.css({
							left: 0,
							right: 0
						});
					
					// TODO this fail if no src attr is set on the iframe (srcdoc)
					//  as a workaround <iframe srcdoc="http://" src="about:blank></iframe>
					if ( ! embedContainer.attr('src') )
						// TODO youtube recommand an origin param "&origin=" + encodeURIComponent(document.location.origin)
						// https://developers.google.com/youtube/iframe_api_reference#Loading_a_Video_Player
						embedContainer.attr('src', url);
					
					var width = cfg.width || '560',
						height = cfg.height || '315';
					
					// Done trough CSS and JS on resize
					if ( cfg.display == "fit" ) {
						width = "";
						height = "";
					}
					
					if ( width ) {
						if ( ! width.match(/[0-9]+%/) )
							width = width + 'px';
						embedContainer.attr('width', width);
					}
					if ( height ) {
						if ( ! height.match(/[0-9]+%/) )
							height = height + 'px';
						embedContainer.attr('height', height);
					}
					
					embedContainer.parent().addClass('active');
					_this.updateMainStageWithLayoutSettings();
				}
			}
			
			function styleMainStageEmbed()
			{
				$(".mainMediaContainer.active iframe.embedContainer.fit").attr(
					"height", 
					$("#mainStagePanel").width() * 9 / 16
				);
			}
		};
	}
);