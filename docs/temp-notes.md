UI/UX & Network Connectivity Requirements

1. User-Friendly UI/UX
   - The application must have a modern, clean, intuitive, and user-friendly UI/UX.
   - Prioritize simplicity and clarity so users can understand what is happening without needing technical knowledge.
   - Use appropriate tooltips, contextual help, empty states, loading states, error states, confirmation messages, alerts, onboarding hints, and visual feedback wherever they improve the user experience.
   - Use diagrams, flowcharts, visual indicators, charts, or other visualizations when they make complex information easier to understand.
   - Prefer visual explanations over large amounts of technical text whenever possible.
   - Ensure responsive design across different screen sizes and orientations.
   - Follow accessibility best practices, including readable typography, sufficient contrast, touch-friendly controls, meaningful labels, and clear error messages.
   - Maintain consistent spacing, typography, icons, colors, component behavior, and interaction patterns throughout the application.

2. Use Appropriate Libraries and Packages
   - You are allowed to install additional packages when they provide meaningful value to the application.
   - For example, use appropriate libraries for:
     - UI components
     - Icons
     - Animations
     - Charts and data visualization
     - Diagrams and flowcharts
     - Tooltips and guided interactions
     - Network/connectivity detection
     - Responsive layouts
   - Before adding a package, prefer well-maintained, widely adopted libraries and avoid unnecessary dependencies.
   - Do not reinvent functionality that can be implemented reliably using an established package.
   - Ensure all added dependencies are compatible with the existing project and do not unnecessarily increase bundle size or complexity.

3. Network Connectivity Handling
   - The application must properly handle changes in the user's network connection at runtime.
   - Specifically, handle all of the following scenarios:
     - User starts with Wi-Fi and switches to mobile data.
     - User starts with mobile data and switches to Wi-Fi.
     - Wi-Fi and mobile data are both enabled.
     - Wi-Fi becomes disconnected while mobile data remains available.
     - Mobile data becomes unavailable while Wi-Fi remains available.
     - The device temporarily loses all network connectivity.
     - The device reconnects after being offline.
     - The active network changes while an API request is in progress.
   - Do not assume that an active Wi-Fi connection automatically means that the internet is available.
   - Distinguish between:
     - Connected to a network
     - Internet actually reachable
     - Request/API currently available
   - Network state changes must not cause crashes, duplicated requests, inconsistent state, or corrupted data.

4. Network-Aware User Experience
   - Provide clear visual feedback when the user loses internet connectivity.
   - Show an appropriate offline indicator/banner when necessary.
   - When connectivity is restored, automatically recover wherever safe to do so.
   - Avoid repeatedly displaying disruptive alerts for temporary network changes.
   - If an operation fails because of connectivity, explain the problem in user-friendly language and provide an appropriate retry/recovery action.
   - Preserve user input and unsaved work when connectivity is lost.
   - Avoid forcing users to restart the application after reconnecting.

5. API Requests & Data Synchronization
   - Network-dependent operations must gracefully handle:
     - Timeouts
     - Connection failures
     - DNS/network errors
     - Interrupted requests
     - Requests made while offline
     - Requests interrupted during Wi-Fi/mobile-data switching
     - Server errors
     - Reconnection after temporary offline periods
   - Prevent duplicate API requests when the network changes.
   - Properly cancel or retry requests when appropriate.
   - Use retry strategies with reasonable limits and backoff where applicable.
   - If the application uses a data-fetching/state-management library, configure its caching, retry, refetch, and reconnection behavior appropriately.
   - Ensure stale data is clearly distinguished from fresh data when necessary.

6. Offline-First Considerations
   - Where appropriate, allow users to continue using parts of the application that do not require an active internet connection.
   - Cache useful data when this improves the experience.
   - Clearly communicate when displayed information may be cached or outdated.
   - When the connection returns, synchronize data safely without overwriting newer user changes.

7. Network Transition Edge Cases
   - Explicitly test network transitions during:
     - API requests
     - File/image uploads
     - Downloads
     - Authentication
     - Data synchronization
     - Navigation
     - Form submission
     - Any operation involving persistent server-side changes
   - Ensure switching from Wi-Fi ↔ mobile data does not reset application state unnecessarily.
   - Ensure simultaneous Wi-Fi and mobile-data availability does not result in unexpected duplicate operations or inconsistent connectivity state.

8. Error Handling
   - Never expose raw technical/network errors directly to users unless appropriate for a developer/debug screen.
   - Convert technical failures into clear messages such as:
     - "You're currently offline."
     - "Your connection was interrupted. We'll try again."
     - "We couldn't complete this request. Please try again."
   - Provide actionable recovery options such as Retry, Refresh, Continue Offline, or Cancel, depending on the context.

9. Visual Feedback
   - Use appropriate UI states for:
     - Loading
     - Offline
     - Reconnecting
     - Connected
     - Syncing
     - Success
     - Failure
     - Empty data
     - Cached/stale data
   - Use subtle animations where they improve understanding, but avoid excessive animation or visual noise.

10. Implementation Quality

- Before considering the feature complete, inspect the existing architecture and integrate these requirements into the application's current patterns rather than creating isolated or duplicated logic.
- Keep network/connectivity logic centralized and reusable where possible.
- Avoid hardcoded assumptions about the user's network type.
- Handle race conditions and asynchronous state updates carefully.
- Ensure the implementation works reliably on real mobile devices, not only emulators/simulators.
- Test the important connectivity scenarios manually and, where practical, with automated tests.

Important Principle

The application should behave predictably regardless of whether the user is connected through Wi-Fi, mobile data, both, or temporarily has no internet connection. Network changes should feel seamless to the user and should never result in crashes, lost input, duplicated actions, or inconsistent application state.
