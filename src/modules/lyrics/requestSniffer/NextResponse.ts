export interface NextResponse {
  readonly responseContext: ResponseContext;
  readonly contents: Contents;
  readonly currentVideoEndpoint?: CurrentVideoEndpointClass;
  readonly trackingParams: string;
  readonly playerOverlays?: PlayerOverlays;
  readonly videoReporting?: VideoReporting;
  readonly queueContextParams: string;
  readonly continuationContents?: ContinuationContents;
}

export interface Contents {
  readonly singleColumnMusicWatchNextResultsRenderer: SingleColumnMusicWatchNextResultsRenderer;
}

interface SingleColumnMusicWatchNextResultsRenderer {
  readonly tabbedRenderer: TabbedRenderer;
}

interface TabbedRenderer {
  readonly watchNextTabbedResultsRenderer: WatchNextTabbedResultsRenderer;
}

interface WatchNextTabbedResultsRenderer {
  readonly tabs: Tab[];
}

interface Tab {
  readonly tabRenderer: TabRenderer;
}

interface TabRenderer {
  readonly title: TitleEnum;
  readonly content?: TabRendererContent;
  readonly trackingParams: string;
  readonly endpoint?: Endpoint;
  readonly unselectable?: boolean;
}

interface TabRendererContent {
  readonly musicQueueRenderer: MusicQueueRenderer;
}

interface MusicQueueRenderer {
  readonly hack: boolean;
  readonly content?: MusicQueueRendererContent;
  readonly header?: Header;
  readonly subHeaderChipCloud?: SubHeaderChipCloud;
}

interface MusicQueueRendererContent {
  readonly playlistPanelRenderer: PlaylistPanelRenderer;
}

interface PlaylistPanelRenderer {
  readonly contents: PlaylistPanelRendererContent[];
  readonly playlistId?: PlaylistID;
  readonly isInfinite: boolean;
  readonly continuations?: Continuation[];
  readonly trackingParams: string;
  readonly numItemsToShow?: number;
  readonly shuffleToggleButton: PlaylistPanelRendererShuffleToggleButton;
}

interface PlaylistPanelRendererContent {
  readonly playlistPanelVideoWrapperRenderer?: PurplePlaylistPanelVideoWrapperRenderer;
  readonly playlistPanelVideoRenderer?: ContentPlaylistPanelVideoRenderer;
  readonly automixPreviewVideoRenderer?: AutomixPreviewVideoRenderer;
}

interface AutomixPreviewVideoRenderer {
  readonly content: AutomixPreviewVideoRendererContent;
}

interface AutomixPreviewVideoRendererContent {
  readonly automixPlaylistVideoRenderer: AutomixPlaylistVideoRenderer;
}

interface AutomixPlaylistVideoRenderer {
  readonly navigationEndpoint: DefaultServiceEndpointClass;
  readonly trackingParams: string;
  readonly automixMode: string;
}

interface DefaultServiceEndpointClass {
  readonly clickTrackingParams: string;
  readonly watchPlaylistEndpoint: WatchPlaylistEndpoint;
}

interface WatchPlaylistEndpoint {
  readonly playlistId: PlaylistID;
  readonly params: string;
}

type PlaylistID = string;

interface ContentPlaylistPanelVideoRenderer {
  readonly title: TitleClass;
  readonly longBylineText: LongBylineText;
  readonly thumbnail: ThumbnailDetailsClass;
  readonly lengthText: LengthText;
  readonly selected: boolean;
  readonly navigationEndpoint: CurrentVideoEndpointClass;
  readonly videoId: string;
  readonly shortBylineText: TitleClass;
  readonly trackingParams: string;
  readonly menu: PurpleMenu;
  readonly playlistSetVideoId?: string;
  readonly canReorder: boolean;
  readonly playlistEditParams: PlaylistEditParams;
  readonly queueNavigationEndpoint: PurpleQueueNavigationEndpoint;
  readonly badges?: Badge[];
}

interface Badge {
  readonly musicInlineBadgeRenderer: MusicInlineBadgeRenderer;
}

interface MusicInlineBadgeRenderer {
  readonly trackingParams: string;
  readonly icon: Icon;
  readonly accessibilityData: Accessibility;
}

interface Accessibility {
  readonly accessibilityData: AccessibilityData;
}

interface AccessibilityData {
  readonly label: string;
}

interface Icon {
  readonly iconType: IconType;
}

type IconType =
  | "MUSIC_EXPLICIT_BADGE"
  | "MIX"
  | "ADD_TO_PLAYLIST"
  | "ALBUM"
  | "ARTIST"
  | "PEOPLE_GROUP"
  | "SHARE"
  | "QUEUE_PLAY_NEXT"
  | "ADD_TO_REMOTE_QUEUE"
  | "REMOVE"
  | "FLAG"
  | "DISMISS_QUEUE"
  | "BOOKMARK_BORDER"
  | "FAVORITE"
  | "KEEP"
  | "BOOKMARK"
  | "UNFAVORITE"
  | "KEEP_OFF"
  | "MUSIC_SHUFFLE";

interface LengthText {
  readonly runs: LengthTextRun[];
  readonly accessibility: Accessibility;
}

interface LengthTextRun {
  readonly text: string;
}

export interface LongBylineText {
  readonly runs: PurpleRun[];
}

export interface PurpleRun {
  readonly text: string;
  readonly navigationEndpoint?: Endpoint;
}

interface Endpoint {
  readonly clickTrackingParams: string;
  readonly browseEndpoint: BrowseEndpoint;
}

interface BrowseEndpoint {
  readonly browseId: string;
  readonly browseEndpointContextSupportedConfigs: BrowseEndpointContextSupportedConfigs;
}

interface BrowseEndpointContextSupportedConfigs {
  readonly browseEndpointContextMusicConfig: BrowseEndpointContextMusicConfig;
}

interface BrowseEndpointContextMusicConfig {
  readonly pageType: PageType;
}

type PageType =
  | "MUSIC_PAGE_TYPE_ARTIST"
  | "MUSIC_PAGE_TYPE_ALBUM"
  | "MUSIC_PAGE_TYPE_TRACK_CREDITS"
  | "MUSIC_PAGE_TYPE_TRACK_LYRICS"
  | "MUSIC_PAGE_TYPE_TRACK_RELATED";

interface PurpleMenu {
  readonly menuRenderer: PurpleMenuRenderer;
}

interface PurpleMenuRenderer {
  readonly items: PurpleItem[];
  readonly trackingParams: string;
  readonly accessibility: Accessibility;
}

interface PurpleItem {
  readonly menuNavigationItemRenderer?: MenuItemRenderer;
  readonly menuServiceItemRenderer?: MenuItemRenderer;
  readonly toggleMenuServiceItemRenderer?: PurpleToggleMenuServiceItemRenderer;
  readonly menuServiceItemDownloadRenderer?: MenuServiceItemDownloadRenderer;
}

interface MenuItemRenderer {
  readonly text: TitleClass;
  readonly icon: Icon;
  readonly navigationEndpoint?: MenuNavigationItemRendererNavigationEndpoint;
  readonly trackingParams: string;
  readonly serviceEndpoint?: MenuNavigationItemRendererServiceEndpoint;
}

interface MenuNavigationItemRendererNavigationEndpoint {
  readonly clickTrackingParams: string;
  readonly watchEndpoint?: PurpleWatchEndpoint;
  readonly addToPlaylistEndpoint?: Target;
  readonly browseEndpoint?: BrowseEndpoint;
  readonly shareEntityEndpoint?: ShareEntityEndpoint;
}

interface Target {
  readonly videoId: string;
}

interface ShareEntityEndpoint {
  readonly serializedShareEntity: string;
  readonly sharePanelType: SharePanelType;
}

type SharePanelType = "SHARE_PANEL_TYPE_UNIFIED_SHARE_PANEL";

interface PurpleWatchEndpoint {
  readonly videoId: string;
  readonly playlistId: string;
  readonly params: WatchEndpointParams;
  readonly loggingContext: LoggingContext;
  readonly watchEndpointMusicSupportedConfigs: PurpleWatchEndpointMusicSupportedConfigs;
  readonly playerParams?: PlayerParams;
}

interface LoggingContext {
  readonly vssLoggingContext: VssLoggingContext;
}

interface VssLoggingContext {
  readonly serializedContextData: string;
}

type WatchEndpointParams = "wAEB";

type PlayerParams = "0gcJCZoAzrrq_1rT";

interface PurpleWatchEndpointMusicSupportedConfigs {
  readonly watchEndpointMusicConfig: PurpleWatchEndpointMusicConfig;
}

interface PurpleWatchEndpointMusicConfig {
  readonly musicVideoType: MusicVideoType;
}

type MusicVideoType = "MUSIC_VIDEO_TYPE_ATV" | "MUSIC_VIDEO_TYPE_OMV";

interface MenuNavigationItemRendererServiceEndpoint {
  readonly clickTrackingParams: string;
  readonly queueAddEndpoint?: ServiceEndpointQueueAddEndpoint;
  readonly removeFromQueueEndpoint?: RemoveFromQueueEndpoint;
  readonly getReportFormEndpoint?: GetReportFormEndpoint;
  readonly deletePlaylistEndpoint?: DeletePlaylistEndpoint;
}

interface DeletePlaylistEndpoint {
  readonly playlistId: BackingQueuePlaylistIDEnum;
  readonly command: DeletePlaylistEndpointCommand;
}

interface DeletePlaylistEndpointCommand {
  readonly clickTrackingParams: string;
  readonly dismissQueueCommand: Command;
}

interface Command {}

type BackingQueuePlaylistIDEnum = string;

interface GetReportFormEndpoint {
  readonly params: string;
}

interface ServiceEndpointQueueAddEndpoint {
  readonly queueTarget: PurpleQueueTarget;
  readonly queueInsertPosition: QueueInsertPosition;
  readonly commands: CommandElement[];
}

interface CommandElement {
  readonly clickTrackingParams: string;
  readonly addToToastAction: AddToToastAction;
}

interface AddToToastAction {
  readonly item: AddToToastActionItem;
}

interface AddToToastActionItem {
  readonly notificationTextRenderer: NotificationTextRenderer;
}

interface NotificationTextRenderer {
  readonly successResponseText: TitleClass;
  readonly trackingParams: string;
}

interface TitleClass {
  readonly runs: LengthTextRun[];
}

type QueueInsertPosition = "INSERT_AFTER_CURRENT_VIDEO" | "INSERT_AT_END";

interface PurpleQueueTarget {
  readonly videoId: string;
  readonly onEmptyQueue: OnEmptyQueue;
  readonly backingQueuePlaylistId?: BackingQueuePlaylistIDEnum;
}

interface OnEmptyQueue {
  readonly clickTrackingParams: string;
  readonly watchEndpoint: Target;
}

interface RemoveFromQueueEndpoint {
  readonly videoId: string;
  readonly commands: CommandElement[];
}

interface MenuServiceItemDownloadRenderer {
  readonly serviceEndpoint: MenuServiceItemDownloadRendererServiceEndpoint;
  readonly trackingParams: string;
}

interface MenuServiceItemDownloadRendererServiceEndpoint {
  readonly clickTrackingParams: string;
  readonly offlineVideoEndpoint: OfflineVideoEndpoint;
}

interface OfflineVideoEndpoint {
  readonly videoId: string;
  readonly onAddCommand: OnAddCommand;
}

interface OnAddCommand {
  readonly clickTrackingParams: string;
  readonly getDownloadActionCommand: GetDownloadActionCommand;
}

interface GetDownloadActionCommand {
  readonly videoId: string;
  readonly params: GetDownloadActionCommandParams;
}

type GetDownloadActionCommandParams = "CAI%3D";

interface PurpleToggleMenuServiceItemRenderer {
  readonly defaultText: TitleClass;
  readonly defaultIcon: Icon;
  readonly defaultServiceEndpoint: PurpleServiceEndpoint;
  readonly toggledText: TitleClass;
  readonly toggledIcon: Icon;
  readonly toggledServiceEndpoint: PurpleServiceEndpoint;
  readonly trackingParams: string;
}

interface PurpleServiceEndpoint {
  readonly clickTrackingParams: string;
  readonly feedbackEndpoint?: FeedbackEndpoint;
  readonly likeEndpoint?: LikeEndpoint;
}

interface FeedbackEndpoint {
  readonly feedbackToken: string;
}

interface LikeEndpoint {
  readonly status: Status;
  readonly target: Target;
  readonly actions?: LikeEndpointAction[];
  readonly likeParams?: LikeParams;
  readonly removeLikeParams?: LikeParams;
  readonly dislikeParams?: LikeParams;
}

interface LikeEndpointAction {
  readonly clickTrackingParams: string;
  readonly musicLibraryStatusUpdateCommand: MusicLibraryStatusUpdateCommand;
}

interface MusicLibraryStatusUpdateCommand {
  readonly libraryStatus: LibraryStatus;
  readonly addToLibraryFeedbackToken: string;
}

type LibraryStatus = "MUSIC_LIBRARY_STATUS_IN_LIBRARY";

type LikeParams = "OAI%3D";

type Status = "LIKE" | "INDIFFERENT" | "DISLIKE";

export interface CurrentVideoEndpointClass {
  readonly clickTrackingParams: string;
  readonly watchEndpoint: CurrentVideoEndpointWatchEndpoint;
}

interface CurrentVideoEndpointWatchEndpoint {
  readonly videoId: string;
  readonly playlistId?: PlaylistID;
  readonly index?: number;
  readonly params?: string;
  readonly playerParams: string;
  readonly playlistSetVideoId?: string;
  readonly loggingContext?: LoggingContext;
  readonly watchEndpointMusicSupportedConfigs?: FluffyWatchEndpointMusicSupportedConfigs;
  readonly ustreamerConfig?: string;
}

interface FluffyWatchEndpointMusicSupportedConfigs {
  readonly watchEndpointMusicConfig: FluffyWatchEndpointMusicConfig;
}

interface FluffyWatchEndpointMusicConfig {
  readonly hasPersistentPlaylistPanel: boolean;
  readonly musicVideoType: MusicVideoType;
}

type PlaylistEditParams = string;

interface PurpleQueueNavigationEndpoint {
  readonly clickTrackingParams: string;
  readonly queueAddEndpoint: PurpleQueueAddEndpoint;
}

interface PurpleQueueAddEndpoint {
  readonly queueTarget: FluffyQueueTarget;
  readonly queueInsertPosition: QueueInsertPosition;
  readonly params: QueueAddEndpointParams;
}

type QueueAddEndpointParams = "Q0FJJTNE";

interface FluffyQueueTarget {
  readonly videoId: string;
  readonly backingQueuePlaylistId: BackingQueuePlaylistIDEnum;
}

interface ThumbnailDetailsClass {
  readonly thumbnails: ThumbnailElement[];
}

export interface ThumbnailElement {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

interface PurplePlaylistPanelVideoWrapperRenderer {
  readonly primaryRenderer: PrimaryRenderer;
  readonly counterpart: PurpleCounterpart[];
}

interface PurpleCounterpart {
  readonly counterpartRenderer: PurpleCounterpartRenderer;
  readonly segmentMap: SegmentMap;
}

interface PurpleCounterpartRenderer {
  readonly playlistPanelVideoRenderer: PurplePlaylistPanelVideoRenderer;
}

interface PurplePlaylistPanelVideoRenderer {
  readonly title: TitleClass;
  readonly longBylineText: LongBylineText;
  readonly thumbnail: ThumbnailDetailsClass;
  readonly lengthText: LengthText;
  readonly selected: boolean;
  readonly navigationEndpoint: CurrentVideoEndpointClass;
  readonly videoId: string;
  readonly shortBylineText: TitleClass;
  readonly trackingParams: string;
  readonly menu: PurpleMenu;
  readonly playlistSetVideoId?: string;
  readonly canReorder: boolean;
  readonly playlistEditParams: PlaylistEditParams;
  readonly queueNavigationEndpoint: FluffyQueueNavigationEndpoint;
}

interface FluffyQueueNavigationEndpoint {
  readonly clickTrackingParams: string;
  readonly queueAddEndpoint: FluffyQueueAddEndpoint;
}

interface FluffyQueueAddEndpoint {
  readonly queueTarget: Target;
  readonly queueInsertPosition: QueueInsertPosition;
  readonly params: QueueAddEndpointParams;
}

interface SegmentMap {
  readonly segment?: Segment[];
}

interface Segment {
  readonly primaryVideoStartTimeMilliseconds: string;
  readonly counterpartVideoStartTimeMilliseconds: string;
  readonly durationMilliseconds: string;
}

interface PrimaryRenderer {
  readonly playlistPanelVideoRenderer: ContentPlaylistPanelVideoRenderer;
}

interface Continuation {
  readonly nextRadioContinuationData: NextRadioContinuationData;
}

interface NextRadioContinuationData {
  readonly continuation: string;
  readonly clickTrackingParams: string;
}

interface PlaylistPanelRendererShuffleToggleButton {
  readonly toggleButtonRenderer: PurpleToggleButtonRenderer;
}

interface PurpleToggleButtonRenderer {
  readonly defaultIcon: Icon;
  readonly defaultServiceEndpoint: ToggleButtonRendererDefaultServiceEndpoint;
  readonly toggledIcon: Icon;
  readonly toggledServiceEndpoint: ToggleButtonRendererDefaultServiceEndpoint;
  readonly trackingParams: string;
}

interface ToggleButtonRendererDefaultServiceEndpoint {
  readonly clickTrackingParams: string;
  readonly watchPlaylistEndpoint?: WatchPlaylistEndpoint;
  readonly watchEndpoint?: DefaultServiceEndpointWatchEndpoint;
}

interface DefaultServiceEndpointWatchEndpoint {
  readonly playlistId: string;
  readonly params: string;
  readonly playerParams?: string;
  readonly loggingContext: LoggingContext;
}

interface Header {
  readonly musicQueueHeaderRenderer: MusicQueueHeaderRenderer;
}

interface MusicQueueHeaderRenderer {
  readonly title: TitleClass;
  readonly subtitle: TitleClass;
  readonly buttons: Button[];
  readonly trackingParams: string;
}

interface Button {
  readonly chipCloudChipRenderer: ButtonChipCloudChipRenderer;
}

interface ButtonChipCloudChipRenderer {
  readonly style: StyleClass;
  readonly text: TitleClass;
  readonly navigationEndpoint: PurpleNavigationEndpoint;
  readonly trackingParams: string;
  readonly icon: Icon;
  readonly accessibilityData: Accessibility;
  readonly isSelected: boolean;
  readonly uniqueId: string;
}

interface PurpleNavigationEndpoint {
  readonly clickTrackingParams: string;
  readonly saveQueueToPlaylistCommand: Command;
}

interface StyleClass {
  readonly styleType: string;
}

interface SubHeaderChipCloud {
  readonly chipCloudRenderer: ChipCloudRenderer;
}

interface ChipCloudRenderer {
  readonly chips: Chip[];
  readonly trackingParams: string;
  readonly selectionBehavior: string;
}

interface Chip {
  readonly chipCloudChipRenderer: ChipChipCloudChipRenderer;
}

interface ChipChipCloudChipRenderer {
  readonly text: TitleClass;
  readonly navigationEndpoint: FluffyNavigationEndpoint;
  readonly trackingParams: string;
  readonly accessibilityData: Accessibility;
  readonly isSelected: boolean;
  readonly uniqueId: string;
}

interface FluffyNavigationEndpoint {
  readonly clickTrackingParams: string;
  readonly queueUpdateCommand: QueueUpdateCommand;
}

interface QueueUpdateCommand {
  readonly queueUpdateSection: QueueUpdateSection;
  readonly fetchContentsCommand: FetchContentsCommand;
  readonly dedupeAgainstLocalQueue: boolean;
  readonly syncMode: SyncMode;
}

interface FetchContentsCommand {
  readonly clickTrackingParams: string;
  readonly watchEndpoint: DefaultServiceEndpointWatchEndpoint;
}

type QueueUpdateSection = "QUEUE_UPDATE_SECTION_QUEUE" | "QUEUE_UPDATE_SECTION_AUTOPLAY";

type SyncMode = "QUEUE_UPDATE_SYNC_MODE_DEDUPE_AGAINST_LOCAL";

type TitleEnum = "Up next" | "Lyrics" | "Related";

export interface ContinuationContents {
  readonly playlistPanelContinuation: PlaylistPanelContinuation;
}

interface PlaylistPanelContinuation {
  readonly contents: PlaylistPanelContinuationContent[];
  readonly playlistId: PlaylistID;
  readonly isInfinite: boolean;
  readonly continuations: Continuation[];
  readonly trackingParams: string;
  readonly numItemsToShow: number;
  readonly shuffleToggleButton: PlaylistPanelContinuationShuffleToggleButton;
}

interface PlaylistPanelContinuationContent {
  readonly playlistPanelVideoRenderer?: ContentPlaylistPanelVideoRenderer;
  readonly playlistPanelVideoWrapperRenderer?: FluffyPlaylistPanelVideoWrapperRenderer;
}

interface FluffyPlaylistPanelVideoWrapperRenderer {
  readonly primaryRenderer: PrimaryRenderer;
  readonly counterpart: FluffyCounterpart[];
}

interface FluffyCounterpart {
  readonly counterpartRenderer: FluffyCounterpartRenderer;
  readonly segmentMap: SegmentMap;
}

interface FluffyCounterpartRenderer {
  readonly playlistPanelVideoRenderer: FluffyPlaylistPanelVideoRenderer;
}

interface FluffyPlaylistPanelVideoRenderer {
  readonly title: TitleClass;
  readonly longBylineText: TitleClass;
  readonly thumbnail: ThumbnailDetailsClass;
  readonly lengthText: LengthText;
  readonly selected: boolean;
  readonly navigationEndpoint: CurrentVideoEndpointClass;
  readonly videoId: string;
  readonly shortBylineText: TitleClass;
  readonly trackingParams: string;
  readonly menu: FluffyMenu;
  readonly playlistSetVideoId: string;
  readonly canReorder: boolean;
  readonly playlistEditParams: PlaylistEditParams;
  readonly queueNavigationEndpoint: FluffyQueueNavigationEndpoint;
}

interface FluffyMenu {
  readonly menuRenderer: FluffyMenuRenderer;
}

interface FluffyMenuRenderer {
  readonly items: FluffyItem[];
  readonly trackingParams: string;
  readonly accessibility: Accessibility;
}

interface FluffyItem {
  readonly menuNavigationItemRenderer?: MenuItemRenderer;
  readonly menuServiceItemRenderer?: MenuItemRenderer;
  readonly toggleMenuServiceItemRenderer?: FluffyToggleMenuServiceItemRenderer;
  readonly menuServiceItemDownloadRenderer?: MenuServiceItemDownloadRenderer;
}

interface FluffyToggleMenuServiceItemRenderer {
  readonly defaultText: TitleClass;
  readonly defaultIcon: Icon;
  readonly defaultServiceEndpoint: ServiceEndpoint;
  readonly toggledText: TitleClass;
  readonly toggledIcon: Icon;
  readonly toggledServiceEndpoint: ServiceEndpoint;
  readonly trackingParams: string;
}

interface ServiceEndpoint {
  readonly clickTrackingParams: string;
  readonly likeEndpoint: LikeEndpoint;
}

interface PlaylistPanelContinuationShuffleToggleButton {
  readonly toggleButtonRenderer: FluffyToggleButtonRenderer;
}

interface FluffyToggleButtonRenderer {
  readonly defaultIcon: Icon;
  readonly defaultServiceEndpoint: DefaultServiceEndpointClass;
  readonly toggledIcon: Icon;
  readonly toggledServiceEndpoint: DefaultServiceEndpointClass;
  readonly trackingParams: string;
}

export interface PlayerOverlays {
  readonly playerOverlayRenderer: PlayerOverlayRenderer;
}

interface PlayerOverlayRenderer {
  readonly actions: PlayerOverlayRendererAction[];
  readonly browserMediaSession: BrowserMediaSession;
}

interface PlayerOverlayRendererAction {
  readonly likeButtonRenderer: LikeButtonRenderer;
}

interface LikeButtonRenderer {
  readonly target: Target;
  readonly likeStatus: Status;
  readonly trackingParams: string;
  readonly likesAllowed: boolean;
  readonly serviceEndpoints: ServiceEndpoint[];
}

interface BrowserMediaSession {
  readonly browserMediaSessionRenderer: BrowserMediaSessionRenderer;
}

interface BrowserMediaSessionRenderer {
  readonly album?: TitleClass;
  readonly thumbnailDetails: ThumbnailDetailsClass;
}

export interface ResponseContext {
  readonly serviceTrackingParams: ServiceTrackingParam[];
  readonly innertubeTokenJar?: InnertubeTokenJar;
}

interface InnertubeTokenJar {
  readonly appTokens: AppToken[];
}

interface AppToken {
  readonly type: number;
  readonly value: string;
  readonly maxAgeSeconds: number;
  readonly creationTimeUsec: string;
}

interface ServiceTrackingParam {
  readonly service: Service;
  readonly params: Param[];
}

interface Param {
  readonly key: Key;
  readonly value: string;
}

type Key = "c" | "cver" | "yt_li" | "GetWatchNext_rid" | "logged_in" | "client.version" | "client.name";

type Service = "CSI" | "GFEEDBACK" | "ECATCHER";

export interface VideoReporting {
  readonly reportFormModalRenderer: ReportFormModalRenderer;
}

interface ReportFormModalRenderer {
  readonly optionsSupportedRenderers: OptionsSupportedRenderers;
  readonly trackingParams: string;
  readonly title: TitleClass;
  readonly submitButton: CancelButtonClass;
  readonly cancelButton: CancelButtonClass;
  readonly footer: Footer;
}

interface CancelButtonClass {
  readonly buttonRenderer: ButtonRenderer;
}

interface ButtonRenderer {
  readonly style: StyleEnum;
  readonly isDisabled: boolean;
  readonly text: TitleClass;
  readonly trackingParams: string;
}

type StyleEnum = "STYLE_TEXT" | "STYLE_BRAND";

interface Footer {
  readonly runs: FooterRun[];
}

interface FooterRun {
  readonly text: string;
  readonly navigationEndpoint?: RunNavigationEndpoint;
}

interface RunNavigationEndpoint {
  readonly clickTrackingParams: string;
  readonly urlEndpoint: URLEndpoint;
}

interface URLEndpoint {
  readonly url: string;
}

interface OptionsSupportedRenderers {
  readonly optionsRenderer: OptionsRenderer;
}

interface OptionsRenderer {
  readonly items: OptionsRendererItem[];
  readonly trackingParams: string;
}

interface OptionsRendererItem {
  readonly optionSelectableItemRenderer: OptionSelectableItemRenderer;
}

interface OptionSelectableItemRenderer {
  readonly text: TitleClass;
  readonly trackingParams: string;
  readonly submitEndpoint: SubmitEndpoint;
}

interface SubmitEndpoint {
  readonly clickTrackingParams: string;
  readonly flagEndpoint: FlagEndpoint;
}

interface FlagEndpoint {
  readonly flagAction: string;
}
