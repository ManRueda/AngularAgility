/*
 * AngularAgility Form Extensions
 *
 * http://www.johnculviner.com
 *
 * Copyright (c) 2014 - John Culviner
 *
 * Licensed under the MIT license:
 *   http://www.opensource.org/licenses/mit-license.php
 */

(function() {
    'use strict';
    angular.module('aa.formExtensions', [])
        .directive('aaSaveForm', function() {
            return {
                link: function() {
                    throw "aaSaveForm has been deprecated in favor of a more sensically named aaSubmitForm";
                }
            };
        })
        .directive('aaSubmitForm', ['aaFormExtensions', '$q', function(aaFormExtensions, $q) {
            return {
                scope: {
                    onInvalidAttempt: '&',
                    aaSubmitForm: '&'
                },
                restrict: 'A',
                require: '^form',
                link: function(scope, element, attrs, ngForm) {
                    element.on('click', function() {
                        scope.$apply(function() {

                            ngForm.$aaFormExtensions.$onSubmitAttempt();

                            if (ngForm.$valid) {

                                var spinnerClickStrategy = aaFormExtensions.spinnerClickStrategies[attrs.spinnerClickStrategy || aaFormExtensions.defaultSpinnerClickStrategy];
                                var eleSpinnerClickStrategy = spinnerClickStrategy(element);
                                eleSpinnerClickStrategy.before();

                                //if this isn't a promise it will resolve immediately
                                $q.when(scope.aaSubmitForm())
                                    .then(function(result) {
                                        eleSpinnerClickStrategy.after();
                                        return result;
                                    });

                            } else {
                                var hasScopeFunction = typeof scope.onInvalidAttempt() === 'function';
                                var hasGlobalFunction = typeof aaFormExtensions.defaultOnInvalidAttempt === 'function';

                                if (hasScopeFunction || hasGlobalFunction) {
                                    //calc error messages

                                    var errorMessages = [];

                                    angular.forEach(ngForm.$aaFormExtensions, function(fieldObj, fieldName) {

                                        if (fieldName.indexOf('$') === 0) {
                                            return;
                                        }

                                        errorMessages = errorMessages.concat(fieldObj.$errorMessages);
                                    });

                                    if (hasScopeFunction) {
                                        scope.onInvalidAttempt(errorMessages, ngForm);
                                        return;
                                    }

                                    aaFormExtensions.defaultOnInvalidAttempt(errorMessages, ngForm);
                                }
                            }
                        });
                    });

                }
            };
        }])

        //constructs myForm.$aaFormExtensions.myFieldName object
        //including validation messages for all ngModels at form.$aaFormExtensions.
        //messages can be used there manually or emitted automatically with aaValMsg
        .directive('ngModel', ['aaFormExtensions', '$document', '$timeout', function(aaFormExtensions, $document, $timeout) {
            return {
                require: ['ngModel', '?^form'],
                priority: 1,
                link: function(scope, element, attrs, controllers) {
                    var ngModel = controllers[0],
                        ngForm = controllers[1],
                        fieldName = "This field",
                        field = ngForm.$aaFormExtensions[ngModel.$name];

                    if (!ngForm)
                        return; //only for validation with forms

                    if (attrs.aaLabel) {
                        //use default label
                        fieldName = attrs.aaLabel;

                    } else if (element[0].id) {
                        //is there a label for this field?
                        angular.forEach($document.find('label'), function(label) {
                            if (label.getAttribute("for") === element[0].id) {
                                fieldName = (label.innerHTML || "").replace('*', '').trim();
                            }
                        });
                    }

                    ensureaaFormExtensionsFieldExists(ngForm, ngModel.$name);
                    field.$getElement = function() {
                        return element;
                    };
                    field.ngModel = ngModel;
                    field.form = ngForm;

                    element.on('blur', function() {
                        field.$hadFocus = true;
                        element.addClass('aa-had-focus');

                        if (!scope.$$phase) {
                            //sometimes a blur can happen during a digest or apply...
                            scope.$apply();
                        }
                    });


                    scope.$watch(function() {
                        return ngForm.$aaFormExtensions.$invalidAttempt;
                    }, function(val) {
                        if (val) {
                            element.addClass('aa-invalid-attempt');
                        }
                    });

                    //need this to run AFTER Angular's 'ngModel' runs... another way?
                    $timeout(calcErrorMessages, 0);

                    //subsequent runs after value changes in GUI...
                    ngModel.$parsers.push(calcErrorMessages);

                    function calcErrorMessages(val) {
                        var fieldErrorMessages = field.$errorMessages,
                            msg,
                            fieldForms = [];

                        //clear out the validation messages that exist on *just the field*
                        fieldErrorMessages.length = 0;

                        //find all forms recursively that this field is a child of
                        collectForms(ngForm);
                        function collectForms(form) {
                            fieldForms.push(form);
                            if (form.$aaFormExtensions.$parentForm) {
                                collectForms(form.$aaFormExtensions.$parentForm);
                            }
                        }

                        for (var key in ngModel.$error) {
                            if (ngModel.$error[key]) {

                                //for each possible validation message check if there is a custom
                                //validation message template on the element otherwise use
                                //the globally registered one
                                if (key === 'minlength') {
                                    msg = stringFormat(attrs.ngMinlengthMsg || aaFormExtensions.validationMessages.minlength, fieldName, attrs.ngMinlength);
                                    fieldErrorMessages.push(msg);
                                } else if (key === 'maxlength') {
                                    msg = stringFormat(attrs.ngMaxlengthMsg || aaFormExtensions.validationMessages.maxlength, fieldName, attrs.ngMaxlength);
                                    fieldErrorMessages.push(msg);
                                } else if (key === 'min') {
                                    msg = stringFormat(attrs.minMsg || aaFormExtensions.validationMessages.min, fieldName, attrs.min);
                                    fieldErrorMessages.push(msg);
                                } else if (key === 'max') {
                                    msg = stringFormat(attrs.maxMsg || aaFormExtensions.validationMessages.max, fieldName, attrs.max);
                                    fieldErrorMessages.push(msg);
                                } else if (key === 'pattern') {
                                    msg = stringFormat(attrs.ngPatternMsg || aaFormExtensions.validationMessages.pattern, fieldName);
                                    fieldErrorMessages.push(msg);
                                } else if (key === 'required' && element[0].type === 'number') {
                                    //angular doesn't correctly flag numbers as invalid rather as required when something wrong is filled in
                                    //hack around it
                                    msg = stringFormat(attrs.numberMsg || aaFormExtensions.validationMessages.number, fieldName);
                                    fieldErrorMessages.push(msg);
                                } else if (aaFormExtensions.validationMessages[key]) {
                                    msg = stringFormat(attrs[key + 'Msg'] || aaFormExtensions.validationMessages[key], fieldName);
                                    fieldErrorMessages.push(msg);
                                }
                            }
                        }

                        angular.forEach(fieldForms, function(form) {

                            //clear out any validation messages that exist for this field
                            for (var i = form.$aaFormExtensions.$allValidationErrors.length - 1; i >= 0; i--) {
                                if (form.$aaFormExtensions.$allValidationErrors[i].field === field) {
                                    form.$aaFormExtensions.$allValidationErrors.splice(i, 1);
                                }
                            }

                            //push any new ones on
                            angular.forEach(fieldErrorMessages, function(msg) {
                                form.$aaFormExtensions.$allValidationErrors.push({
                                    field: field,
                                    message: msg
                                });
                            });
                        });

                        //$parsers work in a chain, don't remove this!
                        return val;
                    }
                }
            };
        }])

        //place on an element with ngModel to generate validation messages for it
        //will use the default configured validation message placement strategy unless a custom strategy is passed in
        .directive('aaValMsg', ['$compile', 'aaFormExtensions', function($compile, aaFormExtensions) {
            return {
                require: ['ngModel', '^form'],
                link: function(scope, element, attrs, ctrls) {

                    var ngModel = ctrls[0];
                    var form = ctrls[1];

                    //TODO: auto generation of name would be better than an error IMO
                    if (!attrs.name) {
                        throw "In order to use aaValMsg a name MUST be specified on the element: " + element[0];
                    }

                    var msgElement = aaFormExtensions.valMsgPlacementStrategies[attrs.aaValMsg || aaFormExtensions.defaultValMsgPlacementStrategy](
                        element, form.$name, attrs.name
                    );

                    $compile(msgElement)(scope);
                }
            };
        }])

        //if used directly rather than passively with aaValMsg allows for direct placement of validation messages
        //for a given form field. ex. pass "myForm.myFieldName"
        .directive('aaValMsgFor', ['aaFormExtensions', function(aaFormExtensions) {
            //generate the validation message for a particular form field here
            return {
                require: ['^form'],
                priority: 1,
                scope: true,
                link: function($scope, element, attrs) {

                    var fullFieldPath = attrs.aaValMsgFor,
                        fieldInForm = $scope.$eval(fullFieldPath),
                        formObj = $scope.$eval(fullFieldPath.substring(0, fullFieldPath.indexOf('.')));

                    //TODO: if this is inside an isolate scope and the form is outside the isolate scope this doesn't work
                    //could nest multiple forms so can't trust directive require and have to eval to handle edge cases...
                    ensureaaFormExtensionsFieldExists(formObj, fieldInForm.$name);
                    var fieldInFormExtensions = $scope.$eval(fullFieldPath.replace('.', '.$aaFormExtensions.'));

                    $scope.$watchCollection(
                        function() {
                            return fieldInFormExtensions.$errorMessages;
                        },
                        function(val) {
                            $scope.errorMessages = val;
                        }
                    );

                    $scope.$watchCollection(
                        function() {
                            return [
                                formObj.$aaFormExtensions.$invalidAttempt,
                                fieldInFormExtensions.$hadFocus
                            ];
                        },
                        function(watches) {
                            var invalidAttempt = watches[0],
                                hadFocus = watches[1];

                            $scope.showMessages = invalidAttempt || hadFocus;
                        }
                    );
                },
                template: aaFormExtensions.valMsgForTemplate,
                replace: true
            };
        }])

        //generate a label for an input generating an ID for it if it doesn't already exist
        .directive('aaLabel', ['aaFormExtensions', function(aaFormExtensions) {
            return {
                compile: function(element, attrs) {

                    //add default option if specified
                    //if this is a select with a default-option attribute add a default option (per ng spec)
                    if (element.prop('tagName').toUpperCase() === 'SELECT' && attrs.defaultOption !== undefined) {

                        var msg = attrs.defaultOption;

                        if (msg === null || msg === "") {

                            //gen one
                            msg = 'Select';

                            if (attrs.aaLabel) {
                                msg += ' a ' + attrs.aaLabel;
                            }

                            msg += '...';
                        }

                        element.append(angular.element('<option value=""></option>').html(msg));
                    }

                    return function(scope, element, attrs) {
                        var strategy = aaFormExtensions.labelStrategies[attrs.aaLabelStrategy];

                        //this could be a one off strategy on scope. lets try...
                        if (!strategy) {
                            var maybe = scope.$eval(attrs.aaLabelStrategy);
                            if (angular.isFunction(maybe)) {
                                strategy = maybe;
                            }
                        }

                        //use default
                        if (!strategy) {
                            strategy = aaFormExtensions.labelStrategies[aaFormExtensions.defaultLabelStrategy];
                        }

                        var isRequiredField = (attrs.required !== undefined);

                        //auto generate an ID for compliant label names
                        if (!element[0].id) {
                            element[0].id = guid();
                        }

                        strategy(element, attrs.aaLabel, isRequiredField);
                    };
                }
            };
        }])

        .directive('aaAutoField', function() {
            return {
                link: function() {
                    throw "aaAutoField has been deprecated in favor aaField";
                }
            };
        })
        .directive('aaField', ['$compile', function($compile) {
            return {
                restrict: 'A',
                scope: false,
                replace: true,
                priority: 1000,
                terminal: true,
                compile: function(element, attrs) {

                    //use the passed value for ng-model
                    element.attr("ng-model", attrs.aaField);

                    var lastPartOfName = attrs.aaField.substring(attrs.aaField.lastIndexOf('.') + 1);

                    //if no name set calc one
                    if (!attrs.name) {
                        element.attr("name", lastPartOfName);
                    }

                    //assume input type="text" (which a browser will do but many libraries ex. boostrap have styling that requires it)
                    if (!attrs.type && element.prop('tagName').toUpperCase() === 'INPUT') {
                        element.prop('type', 'text');
                    }

                    //if no label and "no-label" don't calc one
                    if (!attrs.aaLabel && attrs.noLabel === undefined) {

                        //remove trailing "Id". Usually a label isn't "PersonId" it's Person
                        if (lastPartOfName.lastIndexOf('Id') === lastPartOfName.length - 2) {
                            lastPartOfName = lastPartOfName.substring(0, lastPartOfName.length - 2);
                        }

                        element.attr('aa-label', toTitleCase(splitCamelCase(lastPartOfName)));
                    }

                    element.attr("aa-val-msg", "");

                    element.removeAttr('aa-field');

                    element.replaceWith(outerHTML(element[0]));

                    return function(scope, element) {
                        $compile(element)(scope);
                    };
                }
            };
        }])

        .directive('aaAutoFieldGroup', function() {
            return {
                link: function() {
                    throw "aaAutoFieldGroup has been deprecated in favor aaFieldGroup";
                }
            };
        })
        .directive('aaFieldGroup', ['$compile', 'aaFormExtensions', function($compile, aaFormExtensions) {
            return {
                restrict: 'A',
                scope: false,
                replace: true,
                priority: 1100,
                terminal: true,
                compile: function(element, attrs) {

                    element.removeAttr('aa-field-group');
                    element.attr("aa-field", attrs.aaFieldGroup);

                    var strat = aaFormExtensions.fieldGroupStrategies[attrs.fieldGroupStrategy || aaFormExtensions.defaultFieldGroupStrategy];
                    strat(element);

                    return function(scope, element) {
                        $compile(element)(scope);
                    };
                }
            };
        }])

        .directive('aaValidIcon', ['aaFormExtensions', function(aaFormExtensions) {
            return {
                require: 'ngModel',
                scope: false,
                compile: function(element) {

                    var container = aaFormExtensions.validIconStrategy.getContainer(element);

                    var validIcon = angular.element(aaFormExtensions.validIconStrategy.validIcon);
                    container.append(validIcon);
                    validIcon[0].style.display = 'none';

                    var invalidIcon = angular.element(aaFormExtensions.validIconStrategy.invalidIcon);
                    container.append(invalidIcon);
                    invalidIcon[0].style.display = 'none';

                    return function(scope, element, attrs, ngModel) {
                        ngModel.$parsers.push(function(val) {

                            if (ngModel.$valid) {
                                validIcon[0].style.display = '';
                                invalidIcon[0].style.display = 'none';
                            } else {
                                validIcon[0].style.display = 'none';
                                invalidIcon[0].style.display = '';
                            }

                            return val;
                        });
                    };
                }
            };
        }])

        //perform an ng-click that watches for a $q promise
        //showing a loading indicator using the default spinnerClickStrategy
        //or a specified (inline on the directive) spinner-click-strategy="myStrategy"
        .directive('aaSpinnerClick', ['$q', 'aaFormExtensions', function($q, aaFormExtensions) {
            return {
                link: function(scope, element, attrs) {

                    var strategy = aaFormExtensions.spinnerClickStrategies[attrs.spinnerClickStrategy || aaFormExtensions.defaultSpinnerClickStrategy];

                    if (!strategy) {
                        throw "An inline or default spinner click strategy must be specified";
                    }

                    element.on('click', function() {
                        scope.$apply(function() {

                            var elementStrategy = strategy(element);

                            elementStrategy.before();

                            //if this isn't a promise it will resolve immediately
                            $q.when(scope.$eval(attrs.aaSpinnerClick))
                                .then(function(result) {
                                    elementStrategy.after();
                                    return result;
                                });
                        });
                    });
                }
            };
        }])

        //extend Angular form to have $aaFormExtensions and also keep track of the parent form
        .directive('ngForm', function() {
            return formFactory(true);
        })
        .directive('form', function() {
            return formFactory(false);
        })

        .provider('aaFormExtensions', function() {

            var self = this;

            //LABEL STRATEGIES
            this.defaultLabelStrategy = "default";
            this.setDefaultLabelStrategy = function(strategyName) {
                this.defaultLabelStrategy = strategyName;
            };
            this.labelStrategies = {

                //create a bootstrap3 style label
                bootstrap3InlineForm: function(ele, labelText, isRequired) {

                    var label = angular.element('<label>')
                        .attr('for', ele[0].id)
                        .addClass('col-sm-2 control-label')
                        .html(labelText + (isRequired ? ' *' : ''));


                    var unsupported = [
                        'button',
                        'submit'
                    ];

                    if (unsupported.indexOf(ele[0].type) !== -1) {
                        throw "Generating a label for and input type " + ele[0].type + " is unsupported.";
                    }

                    ele.parent().parent().prepend(label);
                },

                //create a no-frills label directly before the element
                'default': function(ele, labelText, isRequired) {
                    ele[0].parentNode.insertBefore(
                        angular.element('<label>')
                            .attr('for', ele[0].id)
                            .html(labelText + (isRequired ? ' *' : ''))[0],
                        ele[0]);
                }

                //add you own here using registerLabelStrategy
            };
            this.registerLabelStrategy = function(name, strategy) {
                this.labelStrategies[name] = strategy;
            };


            //AUTO FIELD GROUP STRATEGIES
            this.defaultFieldGroupStrategy = "bootstrap3InlineForm";
            this.setDefaultFieldGroupStrategy = function(strategyName) {
                this.defaultFieldGroupStrategy = strategyName;
            };
            this.fieldGroupStrategies = {
                bootstrap3InlineForm: function(element) {

                    //add form-control if it is missing
                    if (!element.prop('class')) {
                        element.addClass('form-control');
                    }

                    element.wrap('<div class="form-group"><div class="col-sm-3"></div></div>');
                }
            };
            this.registerFieldGroupStrategy = function(name, strategy) {
                this.fieldGroupStrategies[name] = strategy;
            };


            //VALIDATION MESSAGE PLACEMENT STRATEGIES
            this.defaultValMsgPlacementStrategy = "default";
            this.setDefaultValMsgPlacementStrategy = function(strategyName) {
                this.defaultValMsgPlacementStrategy = strategyName;
            };
            this.valMsgPlacementStrategies = {

                'default': function(formFieldElement, formName, formFieldName) {

                    var msgElement = angular.element(stringFormat('<div aa-val-msg-for="{0}.{1}"></div>', formName, formFieldName));
                    var fieldType = formFieldElement[0].type;
                    fieldType = fieldType ? fieldType.toLowerCase() : 'text';

                    if (fieldType === 'radio') {
                        //radios tend to be wrapped, go up a few levels (of course you can customize this with your own strategy)
                        formFieldElement.parent().parent().append(msgElement);

                    } else {
                        formFieldElement.after(msgElement);
                    }

                    return msgElement;
                }
            };
            this.registerValMsgPlacementStrategy = function(name, strategy) {
                this.valMsgPlacementStrategies[name] = strategy;
            };


            //VALID ICON STRATEGIES
            this.validIconStrategy = {
                validIcon: '<i class="fa fa-check fa-lg"></i>',
                invalidIcon: '<i class="fa fa-exclamation-circle fa-lg"></i>',
                getContainer: function(element) {
                    var ele = angular.element('<div class="col-xs-1 validation-icons"></span>');
                    element.parent().after(ele);
                    return ele;
                }
            };
            this.setValidIconStrategy = function(strategy) {
                self.validIconStrategy = strategy;
            };

            //aaSpinnerClick strategies
            this.defaultSpinnerClickStrategy = "fontAwesomeInsideButton";
            this.setDefaultSpinnerClickStrategy = function(strategyName) {
                this.defaultSpinnerClickStrategy = strategyName;
            };
            this.spinnerClickStrategies = {
                fontAwesomeInsideButton: function(buttonElement) {

                    var loading = angular.element('<i style="margin-left: 5px;" class="fa fa-spinner fa-spin"></i>');

                    return {
                        before: function() {
                            buttonElement.prop("disabled", true);
                            buttonElement.append(loading);
                        },
                        after: function() {
                            buttonElement.prop("disabled", false);
                            loading.remove();
                        }
                    };
                }
            };
            this.registerSpinnerClickStrategy = function(name, strategy) {
                this.spinnerClickStrategies[name] = strategy;
            };


            //VALIDATION MESSAGES
            this.validationMessages = {
                required: "{0} is required.",
                email: "The field {0} must be an email.",
                minlength: "{0} must be at least {1} character(s).",
                maxlength: "{0} must be less than {1} characters.",
                min: "{0} must be at least {1}.",
                max: "{0} must be at most {1}.",
                pattern: "{0} is invalid.",
                url: "{0} must be a valid URL.",
                number: "{0} must be number."
            };
            this.setValidationMessage = function(directiveName, message) {
                self.validationMessages[directiveName] = message;
            };
            this.setValidationMessages = function(messages) {
                self.validationMessages = messages;
            };

            this.valMsgForTemplate = '<div class="validation-error" ng-show="showMessages" ng-repeat="msg in errorMessages">{{msg}}</div>';
            this.setValMsgForTemplate = function(valMsgForTemplate) {
                this.valMsgForTemplate = valMsgForTemplate;
            };

            this.defaultOnInvalidAttempt = function() {
                //todo integrate with 'growl like' notifications
            };
            this.setDefaultOnInvalidAttempt = function(func) {
                this.defaultOnInvalidAttempt = func;
            };

            this.$get = function() {
                return {
                    defaultLabelStrategy: self.defaultLabelStrategy,
                    labelStrategies: self.labelStrategies,

                    defaultFieldGroupStrategy: self.defaultFieldGroupStrategy,
                    fieldGroupStrategies: self.fieldGroupStrategies,

                    validIconStrategy: self.validIconStrategy,
                    validationMessages: self.validationMessages,

                    valMsgForTemplate: self.valMsgForTemplate,

                    valMsgPlacementStrategies: self.valMsgPlacementStrategies,

                    defaultValMsgPlacementStrategy: self.defaultValMsgPlacementStrategy,

                    defaultOnInvalidAttempt: self.defaultOnInvalidAttempt,

                    defaultSpinnerClickStrategy: self.defaultSpinnerClickStrategy,
                    spinnerClickStrategies: self.spinnerClickStrategies
                };
            };
        });

    //utility
    function guid() {
        /*jshint bitwise: false*/
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function toTitleCase(str) {
        return str.replace(/\w\S*/g, function(txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    }

    function splitCamelCase(str) {
        return str.replace(/([a-z](?=[A-Z]))/g, '$1 ');
    }

    function outerHTML(node) {
        // if IE, Chrome take the internal method otherwise build one
        return node.outerHTML || (function(n) {
            var div = document.createElement('div'), h;
            div.appendChild(n.cloneNode(true));
            h = div.innerHTML;
            div = null;
            return h;
        })(node);
    }

    function stringFormat(format) {
        var args = Array.prototype.slice.call(arguments, 1);
        return format.replace(/{(\d+)}/g, function(match, number) {
            return typeof args[number] !== 'undefined' ? args[number] : match;
        });
    }

    function ensureaaFormExtensionsFieldExists(form, fieldName) {
        if (!form.$aaFormExtensions[fieldName]) {
            form.$aaFormExtensions[fieldName] = {
                $hadFocus: false,
                $errorMessages: [],
                $getElement: null
            };
        }
    }

    function formFactory(isNgForm) {
        return {
            restrict: isNgForm ? 'EAC' : 'E',
            require: 'form',
            compile: function() {
                return {
                    pre: function(scope, element, attrs, thisForm) {

                        //have to manually find parent forms '?^form' doesn't appear to work in this case (as it is very funky)
                        var elm = element,
                            data,
                            parentForm = null;

                        do {
                            elm = elm.parent();
                            data = elm.data();

                            if(data === undefined) {
                                break;
                            }

                            if(data.$formController) {
                                parentForm = data.$formController;
                                break;
                            }

                        } while (true);

                        thisForm.$aaFormExtensions = {
                            $onSubmitAttempt: function() {
                                setAttemptRecursively(thisForm, thisForm.$invalid);
                            },
                            $parentForm: parentForm,
                            $allValidationErrors: []
                        };

                        function setAttemptRecursively(form, isInvalid) {
                            form.$aaFormExtensions.$invalidAttempt = isInvalid;
                            angular.forEach(form, function(fieldVal, fieldName) {
                                if (fieldName.indexOf('$') !== 0 && form.constructor === fieldVal.constructor) {
                                    setAttemptRecursively(fieldVal, isInvalid);
                                }
                            });
                        }

                        //TODO:
                        //when this form's scope is disposed clean up any $allValidationErrors references on parent forms
                        //to prevent memory leaks in the case of a ng-if switching out child forms etc.

                    }
                };
            }
        };
    }
})();
