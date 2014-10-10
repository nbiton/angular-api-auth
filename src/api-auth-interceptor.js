/*global angular:true, browser:true */

/**
 * @license HTTP Auth Interceptor Module for AngularJS
 * (c) 2012 Witold Szczerba
 * License: MIT
 */

/**
 * @license API Auth Interceptor Module for AngularJS
 * (c) 2014 Naor Biton
 * License: MIT
 */

(function () {
  'use strict';

  angular.module('api-auth-interceptor', ['api-auth-interceptor-buffer'])

    .provider('authService', function (){
      var $transportsMap = {}, failingServiceName, serviceNames, buffers = {};

      this.registerTransportProviders = function (providerMap){

        serviceNames = Object.keys(providerMap);
        serviceNames.forEach(function (serviceName){
          var $provider = providerMap[serviceName];

          /**
           * api interceptor.
           * On 401 response (without 'ignoreAuthModule' option) stores the request
           * and broadcasts 'event:auth-loginRequired'.
           * On 403 response (without 'ignoreAuthModule' option) discards the request
           * and broadcasts 'event:auth-forbidden'.
           */
          $provider.interceptors.push(['$rootScope', '$q', '$injector', 'transportBuffer' , function($rootScope, $q, $injector, transportBuffer) {

            return {
              responseError: function(rejection) {
                if (!rejection.config.ignoreAuthModule) {
                  $transportsMap[serviceName] = $transportsMap[serviceName] || $injector.get(serviceName);
                  buffers[serviceName] = buffers[serviceName] || new transportBuffer($transportsMap[serviceName]);
                  failingServiceName = serviceName;

                  switch (rejection.status) {
                    case 401:
                      var deferred = $q.defer();
                      buffers[serviceName].append(rejection.config, deferred);
                      $rootScope.$broadcast('event:auth-loginRequired', rejection);
                      return deferred.promise;
                    case 403:
                      $rootScope.$broadcast('event:auth-forbidden', rejection);
                      break;
                  }
                }

                // otherwise, default behaviour
                return $q.reject(rejection);
              }
            };
          }]);
        });
      };

      this.$get = ['$rootScope', function($rootScope) {
        return {
          /**
           * Call this function to indicate that authentication was successfull and trigger a
           * retry of all deferred requests.
           * @param data an optional argument to pass on to $broadcast which may be useful for
           * example if you need to pass through details of the user that was logged in
           * @param configUpdater an optional transformation function that can modify the
           * requests that are retried after having logged in.  This can be used for example
           * to add an authentication token.  It must return the request.
           */
          loginConfirmed: function(data, configUpdater) {
            var updater = configUpdater || function(config) {return config;};
            buffers[failingServiceName].retryAll(updater);
            $rootScope.$broadcast('event:auth-loginConfirmed', data);
          },

          /**
           * Call this function to indicate that authentication should not proceed.
           * All deferred requests will be abandoned or rejected (if reason is provided).
           * @param data an optional argument to pass on to $broadcast.
           * @param reason if provided, the requests are rejected; abandoned otherwise.
           */
          loginCancelled: function(data, reason) {
            buffers[failingServiceName].rejectAll(reason);
            $rootScope.$broadcast('event:auth-loginCancelled', data);
          }
        };
      }];
    });


  /**
   * Private module, a utility, required internally by 'api-auth-interceptor'.
   */
  angular.module('api-auth-interceptor-buffer', [])

    .factory('transportBuffer', function() {

      return function ($transportService){
        /** Holds all the requests, so they can be re-requested in future. */
        var buffer = [];

        function retryHttpRequest(config, deferred) {
          function successCallback(response) {
            deferred.resolve(response);
          }
          function errorCallback(response) {
            deferred.reject(response);
          }
//        $service = $service || $injector.get('$http');
          $transportService(config).then(successCallback, errorCallback);
        }

        return {
          /**
           * Appends a request configuration object with deferred response attached to buffer.
           */
          append: function(config, deferred) {
            buffer.push({
              config: config,
              deferred: deferred
            });
          },

          /**
           * Abandon or reject (if reason provided) all the buffered requests.
           */
          rejectAll: function(reason) {
            if (reason) {
              for (var i = 0; i < buffer.length; ++i) {
                buffer[i].deferred.reject(reason);
              }
            }
            buffer = [];
          },

          /**
           * Retries all the buffered requests clears the buffer.
           */
          retryAll: function(updater) {
            for (var i = 0; i < buffer.length; ++i) {
              retryHttpRequest(updater(buffer[i].config), buffer[i].deferred);
            }
            buffer = [];
          }
        };
      };
    });
})();
